
// Shared QBO helpers: token endpoint discovery, refresh, query.
async function getTokenEndpoint() {
  try {
    const r = await fetch('https://developer.api.intuit.com/.well-known/openid_configuration');
    if (r.ok) {
      const doc = await r.json();
      if (doc.token_endpoint) return doc.token_endpoint;
    }
  } catch {}
  return 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
}

async function refreshToken(pool, conn) {
  const clientId = process.env.QBO_CLIENT_ID || '';
  const clientSecret = process.env.QBO_CLIENT_SECRET || '';
  const ep = await getTokenEndpoint();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch(ep, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
  });
  if (!r.ok) throw new Error(`Token refresh ${r.status}: ${await r.text()}`);
  const t = await r.json();
  const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await pool.query(
    `UPDATE qbo_connections SET access_token=$1, refresh_token=$2, token_expires_at=$3 WHERE realm_id=$4`,
    [t.access_token, t.refresh_token || conn.refresh_token, expiresAt, conn.realm_id]
  );
  return t.access_token;
}

async function qboFetch(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`QBO ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// Bulk upsert helper — chunks rows by `chunkSize`, uses ON CONFLICT clause.
async function bulkUpsert(pool, table, rows, columns, conflictTarget, chunkSize = 100) {
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
        if (v !== null && v !== undefined && typeof v === 'object' && !(v instanceof Date)) v = JSON.stringify(v);
        params.push(v);
      }
    }
    const updateSet = columns
      .filter(c => !conflictTarget.split(',').map(s => s.trim()).includes(c))
      .map(c => `${c} = EXCLUDED.${c}`)
      .join(', ');
    const q = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}
               ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`;
    await pool.query(q, params);
    total += batch.length;
  }
  return total;
}

async function queryAll(base, realmId, token, entity, where) {
  const all = [];
  for (let sp = 1, pg = 0; pg < 20; pg++) {
    let q = `SELECT * FROM ${entity}`;
    if (where) q += ` WHERE ${where}`;
    q += ` STARTPOSITION ${sp} MAXRESULTS 1000`;
    const d = await qboFetch(
      `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(q)}&minorversion=65`,
      token
    );
    const items = d?.QueryResponse?.[entity] || [];
    all.push(...items);
    if (items.length < 1000) break;
    sp += 1000;
  }
  return all;
}

function extractGL(lines) {
  const glNames = [];
  const lineItems = [];
  for (const l of (lines || [])) {
    if (l.DetailType === 'AccountBasedExpenseLineDetail') {
      const a = l.AccountBasedExpenseLineDetail?.AccountRef;
      if (a?.name) glNames.push(a.name);
      lineItems.push({ amount: Number(l.Amount) || 0, gl_account: a?.name, gl_id: a?.value, description: l.Description });
    } else if (l.DetailType === 'ItemBasedExpenseLineDetail') {
      lineItems.push({ amount: Number(l.Amount) || 0, item: l.ItemBasedExpenseLineDetail?.ItemRef?.name, description: l.Description });
    }
  }
  return { glNames, lineItems };
}

function sectionFromLabel(lbl, fallback) {
  const l = (lbl || '').toLowerCase();
  if (l.includes('equity') && !l.includes('liabilit')) return 'Equity';
  if (l.includes('asset')) return 'Asset';
  if (l.includes('liabilit')) return 'Liability';
  return fallback;
}

function getQboBase() {
  return (process.env.QBO_ENVIRONMENT || 'production') === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

async function getActiveConnection(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM qbo_connections ORDER BY connected_at DESC NULLS LAST LIMIT 1`
  );
  return rows[0];
}

async function ensureToken(pool, conn) {
  let token = conn.access_token;
  if (Date.now() > new Date(conn.token_expires_at).getTime() - 300000) {
    token = await refreshToken(pool, conn);
  }
  return token;
}

module.exports = {
  getTokenEndpoint, refreshToken, qboFetch, bulkUpsert,
  queryAll, extractGL, sectionFromLabel, getQboBase,
  getActiveConnection, ensureToken,
};
