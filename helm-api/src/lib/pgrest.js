// PostgREST query-string → SQL translator for helm-api.
// Subset of PostgREST semantics: select (with embeds), filters, order, limit,
// offset, Range, Prefer:count=exact, insert/upsert/update/delete, RPC.

const VALID_OPS = new Set([
  'eq','neq','gt','gte','lt','lte','like','ilike','match','imatch',
  'in','is','isdistinct','fts','plfts','phfts','wfts','cs','cd','ov','sl','sr','nxr','nxl','adj'
]);

const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdent(name, what='identifier') {
  if (typeof name !== 'string' || !SAFE_IDENT.test(name) || name.length > 63) {
    throw new Error(`invalid ${what}: ${JSON.stringify(name)}`);
  }
  return name;
}

function parseValue(raw, op) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (op === 'is') {
    const v = String(raw).toLowerCase();
    if (v === 'true' || v === 'false' || v === 'null' || v === 'unknown') return v;
  }
  if (op === 'in') {
    let s = raw;
    if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
    return s.split(',').map(p => {
      const t = p.trim();
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
      }
      return t;
    });
  }
  return raw;
}

function opToSql(col, op, rawValue, params) {
  const colSql = `"${assertIdent(col, 'column')}"`;
  const val = parseValue(rawValue, op);
  switch (op) {
    case 'eq': {
      if (val === null) return { sql: `${colSql} IS NULL` };
      params.push(val); return { sql: `${colSql} = $${params.length}` };
    }
    case 'neq': {
      if (val === null) return { sql: `${colSql} IS NOT NULL` };
      params.push(val); return { sql: `${colSql} <> $${params.length}` };
    }
    case 'gt':  params.push(val); return { sql: `${colSql} > $${params.length}` };
    case 'gte': params.push(val); return { sql: `${colSql} >= $${params.length}` };
    case 'lt':  params.push(val); return { sql: `${colSql} < $${params.length}` };
    case 'lte': params.push(val); return { sql: `${colSql} <= $${params.length}` };
    case 'like':   params.push(val); return { sql: `${colSql} LIKE $${params.length}` };
    case 'ilike':  params.push(val); return { sql: `${colSql} ILIKE $${params.length}` };
    case 'match':  params.push(val); return { sql: `${colSql} ~ $${params.length}` };
    case 'imatch': params.push(val); return { sql: `${colSql} ~* $${params.length}` };
    case 'in': {
      if (!Array.isArray(val) || val.length === 0) return { sql: 'FALSE' };
      const ph = val.map(v => { params.push(v); return `$${params.length}`; }).join(',');
      return { sql: `${colSql} IN (${ph})` };
    }
    case 'is': {
      const m = { 'true':'TRUE','false':'FALSE','null':'NULL','unknown':'UNKNOWN' };
      return { sql: `${colSql} IS ${m[val]}` };
    }
    case 'cs': params.push(val); return { sql: `${colSql} @> $${params.length}` };
    case 'cd': params.push(val); return { sql: `${colSql} <@ $${params.length}` };
    case 'ov': params.push(val); return { sql: `${colSql} && $${params.length}` };
    default:
      throw new Error(`unsupported operator: ${op}`);
  }
}

function parseFilter(col, raw, params) {
  const firstDot = raw.indexOf('.');
  if (firstDot < 0) return opToSql(col, 'eq', raw, params);
  const head = raw.slice(0, firstDot);
  const rest = raw.slice(firstDot + 1);
  if (head === 'not') {
    const inner = parseFilter(col, rest, params);
    return { sql: `NOT (${inner.sql})` };
  }
  if (!VALID_OPS.has(head)) throw new Error(`unknown operator: ${head}`);
  return opToSql(col, head, rest, params);
}

function splitTopLevel(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const c of s) {
    if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { out.push(cur); cur = ''; }
    else { cur += c; }
  }
  if (cur) out.push(cur);
  return out;
}

function parseLogical(kind, raw, params) {
  let s = raw;
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
  const parts = splitTopLevel(s);
  const sqls = parts.map(p => {
    if (p.startsWith('or(') || p.startsWith('and(')) {
      const k = p.startsWith('or(') ? 'or' : 'and';
      const body = p.slice(k.length + 1, -1);
      return parseLogical(k, '(' + body + ')', params).sql;
    }
    const dot = p.indexOf('.');
    if (dot < 0) throw new Error(`bad logical part: ${p}`);
    const col = p.slice(0, dot);
    const filt = p.slice(dot + 1);
    return parseFilter(col, filt, params).sql;
  });
  const joiner = kind === 'or' ? ' OR ' : ' AND ';
  return { sql: '(' + sqls.join(joiner) + ')' };
}

function parseSelect(raw) {
  if (!raw || raw === '*') return ['*'];
  const parts = splitTopLevel(raw);
  return parts.map(part => {
    const parenIdx = part.indexOf('(');
    if (parenIdx >= 0) {
      const head = part.slice(0, parenIdx);
      const bodyAndRest = part.slice(parenIdx + 1);
      if (!bodyAndRest.endsWith(')')) throw new Error('unbalanced embed parens');
      const subSel = bodyAndRest.slice(0, -1);
      let alias = null, table = head, fkName = null;
      const colonIdx = head.indexOf(':');
      if (colonIdx >= 0) { alias = head.slice(0, colonIdx); table = head.slice(colonIdx + 1); }
      const bangIdx = table.indexOf('!');
      if (bangIdx >= 0) { fkName = table.slice(bangIdx + 1); table = table.slice(0, bangIdx); }
      return { embed: {
        table: assertIdent(table, 'embed table'),
        alias: alias ? assertIdent(alias, 'embed alias') : null,
        fk: fkName ? assertIdent(fkName, 'fk name') : null,
        sub: parseSelect(subSel),
      } };
    }
    const colonIdx = part.indexOf(':');
    if (colonIdx >= 0) {
      const alias = part.slice(0, colonIdx);
      const col = part.slice(colonIdx + 1);
      return { col: assertIdent(col, 'column'), alias: assertIdent(alias, 'alias') };
    }
    return { col: assertIdent(part, 'column'), alias: null };
  });
}

function parseOrder(raw) {
  return splitTopLevel(raw).map(part => {
    const [col, ...mods] = part.split('.');
    const ascDesc = mods.includes('desc') ? 'DESC' : 'ASC';
    const nulls = mods.includes('nullsfirst') ? ' NULLS FIRST'
                : mods.includes('nullslast') ? ' NULLS LAST' : '';
    return `"${assertIdent(col, 'order column')}" ${ascDesc}${nulls}`;
  });
}

function buildSelectClause(selects) {
  if (selects.length === 1 && selects[0] === '*') return '*';
  return selects.map(s => {
    if (s.alias) return `"${s.col}" AS "${s.alias}"`;
    return `"${s.col}"`;
  }).join(', ');
}

// FK resolver cache
const _fkCache = new Map();

async function resolveFk(pool, parentTable, childTable, hintFkName) {
  const key = `${parentTable}::${childTable}::${hintFkName||''}`;
  if (_fkCache.has(key)) return _fkCache.get(key);
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name AS child_table,
        kcu.column_name AS child_col,
        ccu.table_name AS parent_table,
        ccu.column_name AS parent_col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ((tc.table_name = $1 AND ccu.table_name = $2) OR (tc.table_name = $2 AND ccu.table_name = $1))
        AND ($3 = '' OR tc.constraint_name = $3)
    `, [parentTable, childTable, hintFkName || '']);
    if (result.rows.length === 0) {
      throw new Error(`no FK between ${parentTable} and ${childTable}${hintFkName ? ' named '+hintFkName : ''}`);
    }
    if (result.rows.length > 1 && !hintFkName) {
      throw new Error(`ambiguous FK between ${parentTable} and ${childTable}; specify with !fk_name`);
    }
    const row = result.rows[0];
    const direction = row.child_table === parentTable ? 'to-one' : 'to-many';
    const resolved = {
      direction,
      local_col: direction === 'to-one' ? row.child_col : row.parent_col,
      remote_col: direction === 'to-one' ? row.parent_col : row.child_col,
    };
    _fkCache.set(key, resolved);
    return resolved;
  } finally {
    client.release();
  }
}

async function buildEmbedFragment(pool, parentTable, embed) {
  const fk = await resolveFk(pool, parentTable, embed.table, embed.fk);
  let childCols;
  if (embed.sub.length === 1 && embed.sub[0] === '*') {
    childCols = '*';
  } else {
    childCols = embed.sub.filter(s => !s.embed).map(s => s.alias ? `"${s.col}" AS "${s.alias}"` : `"${s.col}"`).join(', ');
  }
  const outAlias = embed.alias || embed.table;
  if (fk.direction === 'to-many') {
    return `(
      SELECT COALESCE(jsonb_agg(to_jsonb(_emb)), '[]'::jsonb)
      FROM (SELECT ${childCols} FROM "${embed.table}" WHERE "${fk.remote_col}" = "${parentTable}"."${fk.local_col}") _emb
    ) AS "${outAlias}"`;
  }
  return `(
    SELECT to_jsonb(_emb) FROM (
      SELECT ${childCols} FROM "${embed.table}" WHERE "${fk.remote_col}" = "${parentTable}"."${fk.local_col}" LIMIT 1
    ) _emb
  ) AS "${outAlias}"`;
}

async function buildSelectClauseWithEmbeds(pool, parentTable, selects) {
  if (selects.length === 1 && selects[0] === '*') return `"${parentTable}".*`;
  const parts = [];
  for (const s of selects) {
    if (s.embed) parts.push(await buildEmbedFragment(pool, parentTable, s.embed));
    else if (s.alias) parts.push(`"${parentTable}"."${s.col}" AS "${s.alias}"`);
    else parts.push(`"${parentTable}"."${s.col}"`);
  }
  return parts.join(', ');
}

function buildSelectQuery({ table, query, headers }) {
  assertIdent(table, 'table');
  const params = [];
  const wheres = [];
  let selects = ['*'];
  let orderBy = null;
  let limit = null;
  let offset = 0;
  let countMode = null;

  for (const [key, raw] of Object.entries(query)) {
    const values = Array.isArray(raw) ? raw : [raw];
    if (key === 'select')   { selects = parseSelect(values[0]); continue; }
    if (key === 'order')    { orderBy = parseOrder(values[0]); continue; }
    if (key === 'limit')    { limit = parseInt(values[0], 10); continue; }
    if (key === 'offset')   { offset = parseInt(values[0], 10); continue; }
    if (key === 'or' || key === 'and') {
      for (const v of values) wheres.push(parseLogical(key, v, params).sql);
      continue;
    }
    for (const v of values) wheres.push(parseFilter(key, v, params).sql);
  }

  const range = headers['range'];
  if (range && typeof range === 'string') {
    const m = range.match(/^(\d+)-(\d+)?$/);
    if (m) {
      offset = parseInt(m[1], 10);
      if (m[2]) limit = parseInt(m[2], 10) - offset + 1;
    }
  }
  const prefer = headers['prefer'];
  if (prefer && typeof prefer === 'string') {
    const cm = prefer.match(/count=(exact|planned|estimated)/i);
    if (cm) countMode = cm[1].toLowerCase();
  }

  const hasEmbed = selects.some(s => s && s.embed);
  if (hasEmbed) {
    return { needsAsync: true, table, selects, wheres, orderBy, limit, offset, countMode, params };
  }

  const sel = buildSelectClause(selects);
  let sql = `SELECT ${sel} FROM "${table}"`;
  if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`;
  if (orderBy && orderBy.length) sql += ` ORDER BY ${orderBy.join(', ')}`;
  if (limit !== null && !isNaN(limit)) sql += ` LIMIT ${parseInt(limit, 10)}`;
  if (offset > 0) sql += ` OFFSET ${parseInt(offset, 10)}`;
  return { sql, params, countMode, offset, limit };
}

async function buildSelectQueryAsync(pool, args) {
  const r = buildSelectQuery(args);
  if (!r.needsAsync) return r;
  const { table, selects, wheres, orderBy, limit, offset, countMode, params } = r;
  const sel = await buildSelectClauseWithEmbeds(pool, table, selects);
  let sql = `SELECT ${sel} FROM "${table}"`;
  if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`;
  if (orderBy && orderBy.length) sql += ` ORDER BY ${orderBy.join(', ')}`;
  if (limit !== null && !isNaN(limit)) sql += ` LIMIT ${parseInt(limit, 10)}`;
  if (offset > 0) sql += ` OFFSET ${parseInt(offset, 10)}`;
  return { sql, params, countMode, offset, limit };
}

// ─── WRITES ───

function buildWhereFromQuery(query) {
  const params = [];
  const wheres = [];
  for (const [key, raw] of Object.entries(query)) {
    if (['select','order','limit','offset','or','and','on_conflict','columns'].includes(key)) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) wheres.push(parseFilter(key, v, params).sql);
  }
  return { whereSql: wheres.length ? ' WHERE ' + wheres.join(' AND ') : '', params };
}

function buildInsertQuery({ table, body, query, headers }) {
  assertIdent(table, 'table');
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) throw new Error('empty body');
  const colSet = new Set();
  for (const r of rows) for (const k of Object.keys(r)) colSet.add(assertIdent(k, 'column'));
  const cols = Array.from(colSet);
  const params = [];
  const valuesSqls = rows.map(row => {
    const ph = cols.map(c => {
      if (c in row) { params.push(row[c] === undefined ? null : row[c]); return `$${params.length}`; }
      return 'DEFAULT';
    });
    return `(${ph.join(',')})`;
  });
  let sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES ${valuesSqls.join(',')}`;
  const prefer = (headers['prefer'] || '').toLowerCase();
  const isUpsert = prefer.includes('resolution=merge-duplicates') || prefer.includes('resolution=ignore-duplicates');
  if (isUpsert) {
    const onConflict = query.on_conflict;
    if (!onConflict) {
      sql += ` ON CONFLICT DO NOTHING`;
    } else {
      const conflictCols = splitTopLevel(onConflict).map(c => `"${assertIdent(c, 'on_conflict col')}"`).join(',');
      if (prefer.includes('resolution=ignore-duplicates')) {
        sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
      } else {
        const cfList = onConflict.split(',').map(x => x.trim());
        const updateCols = cols.filter(c => !cfList.includes(c));
        if (updateCols.length === 0) {
          sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
        } else {
          const setClauses = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
          sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${setClauses}`;
        }
      }
    }
  }
  if (prefer.includes('return=representation') || prefer.includes('return=headers-only')) {
    sql += ' RETURNING *';
  }
  return { sql, params, prefer };
}

function buildUpdateQuery({ table, body, query, headers }) {
  assertIdent(table, 'table');
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('PATCH body must be a JSON object');
  }
  const keys = Object.keys(body).map(k => assertIdent(k, 'column'));
  if (keys.length === 0) throw new Error('PATCH body must contain at least one field');
  const params = [];
  const setClauses = keys.map(k => {
    params.push(body[k] === undefined ? null : body[k]);
    return `"${k}" = $${params.length}`;
  });
  const { whereSql, params: whereParams } = buildWhereFromQuery(query);
  if (!whereSql) throw new Error('PATCH requires at least one filter (refusing unscoped UPDATE)');
  const shifted = whereSql.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n,10) + params.length}`);
  const allParams = params.concat(whereParams);
  let sql = `UPDATE "${table}" SET ${setClauses.join(', ')}${shifted}`;
  const prefer = (headers['prefer'] || '').toLowerCase();
  if (prefer.includes('return=representation') || prefer.includes('return=headers-only')) sql += ' RETURNING *';
  return { sql, params: allParams, prefer };
}

function buildDeleteQuery({ table, query, headers }) {
  assertIdent(table, 'table');
  const { whereSql, params } = buildWhereFromQuery(query);
  if (!whereSql) throw new Error('DELETE requires at least one filter (refusing unscoped DELETE)');
  let sql = `DELETE FROM "${table}"${whereSql}`;
  const prefer = (headers['prefer'] || '').toLowerCase();
  if (prefer.includes('return=representation') || prefer.includes('return=headers-only')) sql += ' RETURNING *';
  return { sql, params, prefer };
}

function buildRpcQuery({ fn, body }) {
  assertIdent(fn, 'function');
  const args = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
  const keys = Object.keys(args).map(k => assertIdent(k, 'arg name'));
  const params = keys.map(k => args[k]);
  const callList = keys.map((k, i) => `"${k}" => $${i+1}`).join(', ');
  const sql = `SELECT * FROM "${fn}"(${callList})`;
  return { sql, params };
}

module.exports = {
  buildSelectQuery,
  buildSelectQueryAsync,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildRpcQuery,
  parseFilter, parseLogical, parseSelect, parseOrder,
  splitTopLevel, assertIdent, VALID_OPS,
};
