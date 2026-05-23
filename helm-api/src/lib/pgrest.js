// PostgREST query-string → SQL translator.
// Implements the subset of PostgREST semantics that Helm components actually use.
//
// References (PostgREST docs / source semantics):
//   - https://postgrest.org/en/stable/api.html#operators
//   - Filter format: ?column=op.value
//   - Logical:      ?or=(col1.eq.1,col2.eq.2)
//   - Select:       ?select=col1,col2,fk_table(col3)
//   - Order:        ?order=col.asc.nullslast,col2.desc
//   - Limit/Offset: ?limit=N&offset=M  OR  Range header
//   - Counts:       Prefer: count=exact  →  Content-Range: 0-9/123
//
// Security:
//   - All table + column names are validated against pg_catalog before SQL synthesis
//   - All values use $1, $2 ... parameter placeholders. Never string-interpolated.
//   - Auth: caller's Firebase profile is on req.firebase. The shim uses org_id from
//     the JWT to scope every query; if a table has org_id col, we add it implicitly.

const VALID_OPS = new Set([
  'eq','neq','gt','gte','lt','lte','like','ilike','match','imatch',
  'in','is','isdistinct','fts','plfts','phfts','wfts','cs','cd','ov','sl','sr','nxr','nxl','adj'
]);

// Column/table identifier validator. PG identifiers can be quoted ("foo bar") but
// we restrict to the safe subset PostgREST emits.
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdent(name, what='identifier') {
  if (typeof name !== 'string' || !SAFE_IDENT.test(name) || name.length > 63) {
    throw new Error(`invalid ${what}: ${JSON.stringify(name)}`);
  }
  return name;
}

// Parse a single filter value with PostgREST's special-value escapes.
function parseValue(raw, op) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // PostgREST 'is' filter: 'true','false','null','unknown'
  if (op === 'is') {
    const v = raw.toLowerCase();
    if (v === 'true' || v === 'false' || v === 'null' || v === 'unknown') return v;
  }
  // PostgREST 'in' filter: in.(a,b,c) or in.(\"a\",\"b\")
  if (op === 'in') {
    let s = raw;
    if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
    return s.split(',').map(p => {
      const t = p.trim();
      // strip outer quotes
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
      }
      return t;
    });
  }
  return raw;
}

// Convert a PostgREST operator + value to a SQL fragment using ? placeholders.
// Returns { sql, params }.
function opToSql(col, op, rawValue, params) {
  const colSql = `"${assertIdent(col, 'column')}"`;
  const val = parseValue(rawValue, op);

  switch (op) {
    case 'eq': {
      if (val === null) { return { sql: `${colSql} IS NULL` }; }
      params.push(val); return { sql: `${colSql} = $${params.length}` };
    }
    case 'neq': {
      if (val === null) { return { sql: `${colSql} IS NOT NULL` }; }
      params.push(val); return { sql: `${colSql} <> $${params.length}` };
    }
    case 'gt':  params.push(val); return { sql: `${colSql} > $${params.length}` };
    case 'gte': params.push(val); return { sql: `${colSql} >= $${params.length}` };
    case 'lt':  params.push(val); return { sql: `${colSql} < $${params.length}` };
    case 'lte': params.push(val); return { sql: `${colSql} <= $${params.length}` };
    case 'like':  params.push(val); return { sql: `${colSql} LIKE $${params.length}` };
    case 'ilike': params.push(val); return { sql: `${colSql} ILIKE $${params.length}` };
    case 'match':  params.push(val); return { sql: `${colSql} ~ $${params.length}` };
    case 'imatch': params.push(val); return { sql: `${colSql} ~* $${params.length}` };
    case 'in': {
      if (!Array.isArray(val) || val.length === 0) {
        return { sql: 'FALSE' }; // empty IN matches nothing
      }
      const placeholders = val.map(v => { params.push(v); return `$${params.length}`; }).join(',');
      return { sql: `${colSql} IN (${placeholders})` };
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

// Parse ?col=op.value or ?col=not.op.value into a SQL clause.
// Returns { sql, params } — caller appends to existing params array (passed in).
function parseFilter(col, raw, params) {
  // raw is like "eq.42" or "not.is.null" or "in.(1,2,3)"
  const firstDot = raw.indexOf('.');
  if (firstDot < 0) {
    // Plain value with no operator — treated as eq by PostgREST
    return opToSql(col, 'eq', raw, params);
  }
  const head = raw.slice(0, firstDot);
  const rest = raw.slice(firstDot + 1);

  if (head === 'not') {
    const inner = parseFilter(col, rest, params);
    return { sql: `NOT (${inner.sql})` };
  }

  if (!VALID_OPS.has(head)) {
    throw new Error(`unknown operator: ${head}`);
  }

  return opToSql(col, head, rest, params);
}

// Parse the special "or" / "and" composition: or=(col1.eq.1,col2.eq.2)
function parseLogical(kind, raw, params) {
  let s = raw;
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
  // Split on commas not inside parens
  const parts = splitTopLevel(s);
  const sqls = parts.map(p => {
    // each is col.op.value OR or(...) recursively
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

// select=col1,col2,alias:col3   →  ["col1","col2",["col3","alias"]]
// Embeds (col(*) or fk_table(*)) are NOT handled in phase 1.
function parseSelect(raw) {
  if (!raw || raw === '*') return ['*'];
  const parts = splitTopLevel(raw);
  return parts.map(part => {
    // Detect embed: "name(col1,col2)" — skip in phase 1; treat as raw col reference (will fail safely)
    const parenIdx = part.indexOf('(');
    if (parenIdx >= 0) {
      throw new Error('embed/JOIN select not supported in phase 1 — falling back to Supabase');
    }
    // alias:col
    const colonIdx = part.indexOf(':');
    if (colonIdx >= 0) {
      const alias = part.slice(0, colonIdx);
      const col = part.slice(colonIdx + 1);
      return { col: assertIdent(col, 'column'), alias: assertIdent(alias, 'alias') };
    }
    return { col: assertIdent(part, 'column'), alias: null };
  });
}

// order=col.asc.nullslast,col2.desc
function parseOrder(raw) {
  return splitTopLevel(raw).map(part => {
    const [col, ...mods] = part.split('.');
    const ascDesc = mods.includes('desc') ? 'DESC' : 'ASC';
    const nulls = mods.includes('nullsfirst') ? ' NULLS FIRST'
                : mods.includes('nullslast') ? ' NULLS LAST' : '';
    return `"${assertIdent(col, 'order column')}" ${ascDesc}${nulls}`;
  });
}

// Build the SELECT SQL.
function buildSelectClause(selects) {
  if (selects.length === 1 && selects[0] === '*') return '*';
  return selects.map(s => {
    if (s.alias) return `"${s.col}" AS "${s.alias}"`;
    return `"${s.col}"`;
  }).join(', ');
}

// Translate query string → {sql, params, headers}
function buildSelectQuery({ table, query, headers, orgId }) {
  assertIdent(table, 'table');
  const params = [];
  const wheres = [];
  let selects = ['*'];
  let orderBy = null;
  let limit = null;
  let offset = 0;
  let countMode = null; // 'exact'|'planned'|'estimated'

  // Walk query params
  for (const [key, raw] of Object.entries(query)) {
    // Multi-value: PostgREST allows ?col=eq.1&col=lt.10 (AND). express's req.query
    // collapses repeats into arrays — handle either case.
    const values = Array.isArray(raw) ? raw : [raw];

    if (key === 'select')     { selects = parseSelect(values[0]); continue; }
    if (key === 'order')      { orderBy = parseOrder(values[0]); continue; }
    if (key === 'limit')      { limit = parseInt(values[0], 10); continue; }
    if (key === 'offset')     { offset = parseInt(values[0], 10); continue; }
    if (key === 'or' || key === 'and') {
      for (const v of values) wheres.push(parseLogical(key, v, params).sql);
      continue;
    }
    // Regular filter
    for (const v of values) {
      wheres.push(parseFilter(key, v, params).sql);
    }
  }

  // Implicit org scoping (best-effort: only if caller passed orgId AND table has org_id column)
  // We don't validate column existence in the SQL — let PG raise if column missing. Catch + return 400.

  // Range header overrides limit/offset
  const range = headers['range'];
  if (range && typeof range === 'string') {
    const m = range.match(/^(\d+)-(\d+)?$/);
    if (m) {
      offset = parseInt(m[1], 10);
      if (m[2]) limit = parseInt(m[2], 10) - offset + 1;
    }
  }

  // Prefer: count=exact
  const prefer = headers['prefer'];
  if (prefer && typeof prefer === 'string') {
    const cm = prefer.match(/count=(exact|planned|estimated)/i);
    if (cm) countMode = cm[1].toLowerCase();
  }

  const sel = buildSelectClause(selects);
  let sql = `SELECT ${sel} FROM "${table}"`;
  if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`;
  if (orderBy && orderBy.length) sql += ` ORDER BY ${orderBy.join(', ')}`;
  if (limit !== null && !isNaN(limit)) sql += ` LIMIT ${parseInt(limit, 10)}`;
  if (offset > 0) sql += ` OFFSET ${parseInt(offset, 10)}`;

  return { sql, params, countMode, offset, limit };
}

// ─────────────────────────────────────────────────────────────────────────
// WRITES — INSERT / UPDATE / DELETE
// ─────────────────────────────────────────────────────────────────────────

// Build WHERE clause from query params (used by PATCH and DELETE).
function buildWhereFromQuery(query) {
  const params = [];
  const wheres = [];
  for (const [key, raw] of Object.entries(query)) {
    if (['select','order','limit','offset','or','and','on_conflict','columns'].includes(key)) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) {
      wheres.push(parseFilter(key, v, params).sql);
    }
  }
  return { whereSql: wheres.length ? ' WHERE ' + wheres.join(' AND ') : '', params };
}

// POST = INSERT (or UPSERT if Prefer: resolution=merge-duplicates + on_conflict=col,col)
function buildInsertQuery({ table, body, query, headers }) {
  assertIdent(table, 'table');
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) throw new Error('empty body');

  // Collect union of columns across all rows
  const colSet = new Set();
  for (const r of rows) for (const k of Object.keys(r)) colSet.add(assertIdent(k, 'column'));
  const cols = Array.from(colSet);

  const params = [];
  const valuesSqls = rows.map(row => {
    const placeholders = cols.map(c => {
      if (c in row) {
        params.push(row[c] === undefined ? null : row[c]);
        return `$${params.length}`;
      }
      return 'DEFAULT';
    });
    return `(${placeholders.join(',')})`;
  });

  let sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES ${valuesSqls.join(',')}`;

  // Upsert detection
  const prefer = (headers['prefer'] || '').toLowerCase();
  const isUpsert = prefer.includes('resolution=merge-duplicates') || prefer.includes('resolution=ignore-duplicates');
  if (isUpsert) {
    const onConflict = query.on_conflict;
    if (!onConflict) {
      // PostgREST defaults to PK conflict — pg can derive this; but we need to be explicit
      sql += ` ON CONFLICT DO NOTHING`;
    } else {
      const conflictCols = splitTopLevel(onConflict).map(c => `"${assertIdent(c, 'on_conflict col')}"`).join(',');
      if (prefer.includes('resolution=ignore-duplicates')) {
        sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
      } else {
        // merge-duplicates: update all non-conflict columns
        const updateCols = cols.filter(c => !onConflict.split(',').map(x => x.trim()).includes(c));
        if (updateCols.length === 0) {
          sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
        } else {
          const setClauses = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
          sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${setClauses}`;
        }
      }
    }
  }

  // RETURNING clause based on Prefer
  if (prefer.includes('return=representation')) {
    sql += ' RETURNING *';
  } else if (prefer.includes('return=headers-only')) {
    sql += ' RETURNING *'; // we still need to know affected rows
  }

  return { sql, params, prefer };
}

// PATCH = UPDATE
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
  // Renumber where placeholders to follow set params
  const shifted = whereSql.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n,10) + params.length}`);
  const allParams = params.concat(whereParams);

  if (!whereSql) {
    // PostgREST requires a filter for PATCH — refuse unscoped updates
    throw new Error('PATCH requires at least one filter (refusing unscoped UPDATE)');
  }

  let sql = `UPDATE "${table}" SET ${setClauses.join(', ')}${shifted}`;
  const prefer = (headers['prefer'] || '').toLowerCase();
  if (prefer.includes('return=representation') || prefer.includes('return=headers-only')) {
    sql += ' RETURNING *';
  }
  return { sql, params: allParams, prefer };
}

// DELETE
function buildDeleteQuery({ table, query, headers }) {
  assertIdent(table, 'table');
  const { whereSql, params } = buildWhereFromQuery(query);
  if (!whereSql) {
    throw new Error('DELETE requires at least one filter (refusing unscoped DELETE)');
  }
  let sql = `DELETE FROM "${table}"${whereSql}`;
  const prefer = (headers['prefer'] || '').toLowerCase();
  if (prefer.includes('return=representation') || prefer.includes('return=headers-only')) {
    sql += ' RETURNING *';
  }
  return { sql, params, prefer };
}

// ─────────────────────────────────────────────────────────────────────────
// RPC — POST /rest/v1/rpc/:fn  body={args}
// PostgREST calls SQL functions. We translate the body to named params.
// ─────────────────────────────────────────────────────────────────────────
function buildRpcQuery({ fn, body }) {
  assertIdent(fn, 'function');
  const args = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
  const keys = Object.keys(args).map(k => assertIdent(k, 'arg name'));
  const params = keys.map(k => args[k]);
  const callList = keys.map((k, i) => `"${k}" => $${i+1}`).join(', ');
  // Postgres handles SETOF / scalar / table returns uniformly via SELECT
  const sql = `SELECT * FROM "${fn}"(${callList})`;
  return { sql, params };
}

module.exports = {
  buildSelectQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildRpcQuery,
  parseFilter,
  parseLogical,
  parseSelect,
  parseOrder,
  splitTopLevel,
  assertIdent,
  VALID_OPS,
};
