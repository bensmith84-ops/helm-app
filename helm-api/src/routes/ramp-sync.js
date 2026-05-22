
// POST /ramp-sync — port of supabase/functions/ramp-sync
// 3 sync types: transactions, cards, departments. OAuth client_credentials flow.
// Credentials from process.env.RAMP_CLIENT_ID / RAMP_CLIENT_SECRET (was hard-coded in original).
const RAMP_API = 'https://api.ramp.com/developer/v1';
const ORG_ID_DEFAULT = 'a0000000-0000-0000-0000-000000000001';

async function getToken() {
  const CID = process.env.RAMP_CLIENT_ID || '';
  const SEC = process.env.RAMP_CLIENT_SECRET || '';
  if (!CID || !SEC) {
    return { debug: 'RAMP_CLIENT_ID/SECRET not configured' };
  }
  const basicAuth = Buffer.from(`${CID}:${SEC}`).toString('base64');
  const scopes = 'transactions:read cards:read users:read departments:read bills:read reimbursements:read';

  const attempts = [
    { label: 'basic+scope', url: 'https://api.ramp.com/v1/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(scopes)}` },
    { label: 'basic', url: 'https://api.ramp.com/v1/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: 'grant_type=client_credentials' },
    { label: 'body+scope', url: 'https://api.ramp.com/v1/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${CID}&client_secret=${SEC}&scope=${encodeURIComponent(scopes)}` },
    { label: 'body', url: 'https://api.ramp.com/v1/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${CID}&client_secret=${SEC}` },
    { label: 'json', url: 'https://api.ramp.com/v1/token',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: CID, client_secret: SEC, scope: scopes }) },
    { label: 'alt-basic', url: 'https://api.ramp.com/v1/public/customer/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: 'grant_type=client_credentials' },
  ];

  const results = [];
  for (const att of attempts) {
    try {
      const r = await fetch(att.url, { method: 'POST', headers: att.headers, body: att.body });
      const txt = await r.text();
      if (r.ok) {
        try {
          const data = JSON.parse(txt);
          if (data.access_token) return { token: data.access_token, debug: `${att.label} OK` };
          results.push(`${att.label}[${r.status}]:no-token:${txt.slice(0, 80)}`);
        } catch {
          results.push(`${att.label}[${r.status}]:not-json:${txt.slice(0, 80)}`);
        }
      } else {
        results.push(`${att.label}[${r.status}]:${txt.slice(0, 80)}`);
      }
    } catch (e) { results.push(`${att.label}:err:${e?.message}`); }
  }
  return { debug: results.join(' || ') };
}

async function fetchAll(token, basePath) {
  let all = [];
  let url = `${RAMP_API}${basePath}${basePath.includes('?') ? '&' : '?'}page_size=100`;
  for (let i = 0; i < 50; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    all = all.concat(data.data || []);
    const next = data.page?.next;
    if (!next) break;
    url = next.startsWith('http')
      ? next
      : `${RAMP_API}${basePath}${basePath.includes('?') ? '&' : '?'}page_size=100&start=${next}`;
  }
  return all;
}

module.exports = function(app, { pool }) {
  app.post('/ramp-sync', async (req, res) => {
    try {
      const body = req.body || {};
      const orgId = body.org_id || ORG_ID_DEFAULT;
      const syncType = body.sync_type || 'all';
      const fromDate = body.from_date || '2025-01-01';

      // Open log row
      const { rows: logRows } = await pool.query(
        `INSERT INTO ramp_sync_log (org_id, sync_type, status) VALUES ($1, $2, 'running') RETURNING id`,
        [orgId, syncType]
      );
      const logId = logRows[0]?.id;

      const { token, debug } = await getToken();
      if (!token) {
        if (logId) {
          await pool.query(
            `UPDATE ramp_sync_log SET status = 'error', error_message = $1, completed_at = NOW() WHERE id = $2`,
            [debug.slice(0, 2000), logId]
          );
        }
        return res.json({ error: 'Token failed', debug });
      }

      let total = 0;
      const errors = [];

      if (syncType === 'all' || syncType === 'transactions') {
        try {
          const txns = await fetchAll(token, `/transactions?from_date=${fromDate}T00:00:00Z`);
          for (const tx of txns) {
            let hn = null, dn = null, lf = null;
            if (tx.card_holder && typeof tx.card_holder === 'object') {
              hn = [tx.card_holder.first_name, tx.card_holder.last_name].filter(Boolean).join(' ') || null;
              dn = tx.card_holder.department_name || null;
              lf = tx.card_holder.last_four || null;
            }
            try {
              await pool.query(
                `INSERT INTO ramp_transactions
                  (ramp_id, org_id, card_id, card_last_four, card_holder_name, department_name,
                   merchant_name, merchant_category, amount, currency, state, memo,
                   has_receipt, has_memo, transaction_date, synced_at, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16)
                 ON CONFLICT (ramp_id) DO UPDATE
                 SET amount = EXCLUDED.amount, state = EXCLUDED.state, memo = EXCLUDED.memo,
                     has_receipt = EXCLUDED.has_receipt, has_memo = EXCLUDED.has_memo,
                     synced_at = NOW()`,
                [tx.id, orgId, tx.card_id || null, lf, hn, dn,
                 tx.merchant_name || tx.merchant_descriptor || null,
                 tx.sk_category_name || null,
                 Math.abs(Number(tx.amount) || 0), tx.currency_code || 'USD',
                 tx.state || null, tx.memo || null,
                 Array.isArray(tx.receipts) ? tx.receipts.length > 0 : false,
                 !!(tx.memo && String(tx.memo).trim()),
                 tx.user_transaction_time ? tx.user_transaction_time.split('T')[0] : null,
                 JSON.stringify({ keys: Object.keys(tx) })]
              );
              total++;
            } catch (e) {
              errors.push(`tx: ${e?.message}`);
            }
          }
        } catch (e) { errors.push(`transactions: ${e?.message}`); }
      }

      if (syncType === 'all' || syncType === 'cards') {
        try {
          const cards = await fetchAll(token, '/cards');
          for (const c of cards) {
            let hn = null, dn = null;
            if (c.cardholder && typeof c.cardholder === 'object') {
              hn = [c.cardholder.first_name, c.cardholder.last_name].filter(Boolean).join(' ') || null;
              dn = c.cardholder.department_name || null;
            }
            try {
              await pool.query(
                `INSERT INTO ramp_cards
                  (ramp_id, org_id, card_name, last_four, card_type, card_holder_name,
                   card_holder_id, department_name, spending_limit, spending_limit_interval,
                   is_locked, is_terminated, synced_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                 ON CONFLICT (ramp_id) DO UPDATE
                 SET card_name = EXCLUDED.card_name, is_locked = EXCLUDED.is_locked,
                     is_terminated = EXCLUDED.is_terminated, synced_at = NOW()`,
                [c.id, orgId, c.display_name || null, c.last_four || null,
                 c.is_physical ? 'PHYSICAL' : 'VIRTUAL',
                 hn, c.cardholder_id || null, dn,
                 c.spending_restrictions?.amount || null,
                 c.spending_restrictions?.interval || null,
                 c.is_locked || false, c.is_terminated || false]
              );
              total++;
            } catch (e) { errors.push(`card: ${e?.message}`); }
          }
        } catch (e) { errors.push(`cards: ${e?.message}`); }
      }

      if (syncType === 'all' || syncType === 'departments') {
        try {
          const depts = await fetchAll(token, '/departments');
          for (const d of depts) {
            try {
              await pool.query(
                `INSERT INTO ramp_departments (ramp_id, org_id, name, synced_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (ramp_id) DO UPDATE SET name = EXCLUDED.name, synced_at = NOW()`,
                [d.id, orgId, d.name || 'Unknown']
              );
              total++;
            } catch (e) { errors.push(`dept: ${e?.message}`); }
          }
        } catch (e) { errors.push(`departments: ${e?.message}`); }
      }

      const status = errors.length > 0 ? (total > 0 ? 'partial' : 'error') : 'success';
      if (logId) {
        await pool.query(
          `UPDATE ramp_sync_log
           SET status = $1, records_synced = $2, error_message = $3, completed_at = NOW()
           WHERE id = $4`,
          [status, total, errors.length > 0 ? errors.join('; ').slice(0, 2000) : null, logId]
        );
      }

      res.json({
        success: true, status, records_synced: total,
        token_method: debug,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      });
    } catch (e) {
      res.json({ error: e?.message || String(e) });
    }
  });
};
