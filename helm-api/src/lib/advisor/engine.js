// The R&D Advisor engine: one agent loop shared by every PLM AI feature.
//   - chat (Chemist / Sourcing / RFP modes)              -> /rd-advisor
//   - structured tasks (supplier finder, reviews, provider suggestions) -> /rd-advisor {action}
//   - Sourcing Expert / RFP Writer chats + suggest_providers           -> /plm-rfp-assist (delegates here)
// Web search + fetch for outside facts, PLM tools for Earth Breeze data, exact
// calculations through tools, and an optional submit_result tool for JSON output.
const { mintJwt, identityToken } = require('../postgrest');
const { buildSystem } = require('./prompts');
const { ALL_TOOLS, READ_TOOLS, runTool } = require('./tools');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://upbjdmnykheubxkuknuj.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4';
// Strongest model first; falls back if a model id isn't available to this API key.
const MODELS = (process.env.RD_ADVISOR_MODELS || 'claude-opus-5-5,claude-sonnet-5-5,claude-sonnet-4-6').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_ROUNDS = 16;
const HISTORY_MESSAGES = 12;
const HISTORY_CHARS = 6000;
const enc = encodeURIComponent;

// ───────── auth + data access (as the calling user; RLS applies) ─────────
function restClient({ base, headers, fetchImpl = fetch }) {
  const call = async (method, path, { body, prefer } = {}) => {
    const h = { ...(await headers()), Accept: 'application/json' };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    const r = await fetchImpl(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} ${r.status}: ${(data && data.message) || String(text).slice(0, 200)}`);
    return data;
  };
  return {
    get: (path) => call('GET', path),
    insert: (table, row) => call('POST', `/${table}`, { body: row, prefer: 'return=representation' }).then((d) => (Array.isArray(d) ? d[0] : d)),
    // PostgREST bulk inserts need every row to carry the same keys; fill gaps with null.
    insertMany: (table, rows) => call('POST', `/${table}`, { body: sameKeys(rows), prefer: 'return=representation' }),
  };
}
function sameKeys(rows) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] === undefined ? null : r[k]])));
}
async function svcHeaders(base) {
  if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) return {};
  return { 'X-Serverless-Authorization': `Bearer ${await identityToken(base)}` };
}
async function supabaseUser(token, fetchImpl) {
  const r = await fetchImpl(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null; const u = await r.json(); return u && u.id ? u : null;
}
// Returns { db, userId, orgId, backend } or { error: [status, message] }.
async function resolveUserDb(req, { pool, verifyFirebase, fetchImpl = fetch }) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: [401, 'Sign in required'] };
  let fb = null; try { fb = await verifyFirebase(token); } catch { fb = null; }
  let db, userId, backend;
  if (fb) {
    const base = (process.env.POSTGREST_URL || '').replace(/\/+$/, '');
    if (!base) return { error: [503, 'R&D Advisor data service not configured (POSTGREST_URL)'] };
    const { rows } = await pool.query('SELECT id FROM profiles WHERE firebase_uid = $1 LIMIT 1', [fb.sub]);
    if (!rows[0]) return { error: [403, 'No Helm profile for this sign-in'] };
    userId = rows[0].id; backend = 'gcp';
    db = restClient({ base, fetchImpl, headers: async () => ({ ...(await svcHeaders(base)), Authorization: `Bearer ${mintJwt({ sub: userId, role: 'authenticated', email: fb.email })}` }) });
  } else {
    const su = await supabaseUser(token, fetchImpl);
    if (!su) return { error: [401, 'Session expired - refresh the page and try again'] };
    userId = su.id; backend = 'supabase';
    db = restClient({ base: `${SUPABASE_URL}/rest/v1`, fetchImpl, headers: async () => ({ apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }) });
  }
  const memberships = await db.get(`/org_memberships?select=org_id,role&user_id=eq.${enc(userId)}&is_active=eq.true`).catch(() => []);
  if (!memberships.length) return { error: [403, 'Helm membership required'] };
  return { db, userId, orgId: memberships[0].org_id, backend };
}

// ───────── message helpers ─────────
function collectSources(content) {
  const out = new Map();
  for (const b of content || []) {
    if (b.type === 'text' && Array.isArray(b.citations)) for (const c of b.citations) if (c.url && !out.has(c.url)) out.set(c.url, c.title || c.url);
  }
  return out;
}
// Every URL a search or fetch actually returned in this conversation (used to check structured results).
function collectSeenUrls(content, seen) {
  for (const b of content || []) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) seen.add(r.url);
    if (b.type === 'web_fetch_tool_result' && b.content && b.content.url) seen.add(b.content.url);
    if (b.type === 'server_tool_use' && b.name === 'web_fetch' && b.input?.url) seen.add(b.input.url);
  }
}
function withSources(text, sources) {
  if (!sources.size) return text;
  const missing = [...sources].filter(([url]) => !text.includes(url));
  if (!missing.length) return text;
  return `${text.trim()}\n\n**Sources**\n${missing.map(([url, title]) => `- [${String(title).replace(/[[\]]/g, '')}](${url})`).join('\n')}`;
}
function trimHistory(history) {
  return (history || [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.length > HISTORY_CHARS ? m.content.slice(0, HISTORY_CHARS) + '\n[...earlier answer truncated]' : m.content }));
}
function normalize(messages) {
  const out = [];
  for (const m of messages) {
    if (!out.length && m.role !== 'user') continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1] = { role: m.role, content: `${out[out.length - 1].content}\n\n${m.content}` };
    else out.push(m);
  }
  return out;
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

// ───────── context block ─────────
async function contextBlock(db, { program_id, rfp_id, extraContext }) {
  const parts = [`Today is ${new Date().toISOString().slice(0, 10)}.`];
  try {
    const progs = await runTool(db, {}, 'list_programs', {});
    parts.push('# Earth Breeze portfolio index\n' + progs.map((p) => `- ${p.name} | id ${p.id}${p.program_type ? ` | ${p.program_type}` : ''}${p.current_stage ? ` | stage ${p.current_stage}` : ''}`).join('\n'));
  } catch (e) { parts.push(`(could not load programs: ${e.message})`); }
  if (program_id) {
    try {
      const p = await runTool(db, {}, 'get_program', { program_id });
      if (p.program) parts.push(`# Open program\nThe user has this program open: ${p.program.name} (id ${p.program.id}), stage ${p.program.current_stage || 'unknown'}.\nFormulations: ${p.formulations.map((f) => `${f.name} ${f.version || ''} [${f.status}] (id ${f.id})`).join('; ') || 'none'}.\nDesired claims: ${(p.program.desired_claims || []).join('; ') || 'none recorded'}. Markets: ${(p.program.target_markets_v2 || []).join(', ') || 'not set'}.`);
    } catch {}
  }
  if (rfp_id) {
    try { const [r] = await db.get(`/plm_rfps?select=id,name,rfp_type,status,target_volume,target_volume_unit,target_unit_price,currency&id=eq.${enc(rfp_id)}`); if (r) parts.push(`# Open RFP\n${r.name} (id ${r.id}), type ${r.rfp_type || 'n/a'}, status ${r.status}, target volume ${r.target_volume ?? 'n/a'} ${r.target_volume_unit || ''}, target unit price ${r.target_unit_price ?? 'n/a'} ${r.currency || ''}. Use compare_quotes with this rfp_id for quote maths.`); } catch {}
  }
  if (extraContext) parts.push(`# Context from the screen\n${String(extraContext).slice(0, 6000)}`);
  return parts.join('\n\n');
}

// ───────── the loop ─────────
// opts: { client, db, userId, orgId, mode, task, question, history, program_id, rfp_id, extraContext,
//         resultSchema, allowWrites=true, models, log }
async function runAdvisor(opts) {
  const { client, db, mode = 'chemist', task = null, resultSchema = null } = opts;
  const { blocks, persona } = buildSystem(mode, task);
  const system = [...blocks, { type: 'text', text: await contextBlock(db, opts) }];
  const serverTools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: persona.maxSearch },
    { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: persona.maxFetch, citations: { enabled: true }, max_content_tokens: 12000 },
  ];
  const submit = resultSchema ? [{ name: 'submit_result', description: 'Submit the final structured result. Call exactly once, when your research is done.', input_schema: resultSchema }] : [];
  const tools = [...serverTools, ...(opts.allowWrites === false ? READ_TOOLS : ALL_TOOLS), ...submit];
  const models = opts.models || MODELS;
  let model = models[0];
  const ctx = { userId: opts.userId, orgId: opts.orgId, created: [] };
  const usage = { input_tokens: 0, output_tokens: 0, web_searches: 0, web_fetches: 0, tool_calls: 0 };
  const sources = new Map(); const seen = new Set();
  let cur = normalize([...trimHistory(opts.history), { role: 'user', content: String(opts.question || '').trim() }]);
  let finalText = ''; let result = null;

  const create = async (params) => {
    for (let mi = models.indexOf(model); mi < models.length; mi++) {
      try { return await client.messages.create({ ...params, model: models[mi] }, { headers: { 'anthropic-beta': 'web-fetch-2025-09-10' } }); }
      catch (e) {
        const notFound = e?.status === 404 || (/model/i.test(e?.message || '') && /not.?found|invalid|does not exist/i.test(e?.message || ''));
        if (!notFound || mi === models.length - 1) throw e;
        model = models[mi + 1];
      }
    }
  };
  const track = (r) => {
    usage.input_tokens += r.usage?.input_tokens || 0; usage.output_tokens += r.usage?.output_tokens || 0;
    usage.web_searches += r.usage?.server_tool_use?.web_search_requests || 0; usage.web_fetches += r.usage?.server_tool_use?.web_fetch_requests || 0;
    for (const [u, t] of collectSources(r.content)) sources.set(u, t);
    collectSeenUrls(r.content, seen);
  };

  for (let round = 0; round < MAX_ROUNDS && !result; round++) {
    const r = await create({ model, max_tokens: resultSchema ? 8000 : 10000, system, tools, messages: cur });
    track(r);
    const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (r.stop_reason === 'pause_turn') { cur = [...cur, { role: 'assistant', content: r.content }]; finalText += text; continue; }
    const calls = (r.content || []).filter((b) => b.type === 'tool_use');
    if (r.stop_reason === 'tool_use' && calls.length) {
      const sub = calls.find((c) => c.name === 'submit_result');
      if (sub) { result = sub.input || {}; finalText = text; break; }
      const results = [];
      for (const c of calls) {
        usage.tool_calls++;
        let out; try { out = await runTool(opts.db, ctx, c.name, c.input || {}); } catch (e) { out = { error: e.message }; }
        results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out).slice(0, 60000) });
      }
      cur = [...cur, { role: 'assistant', content: r.content }, { role: 'user', content: results }];
      finalText = '';
      continue;
    }
    finalText += text;
    if (resultSchema && !result) {
      // Ask once more, forcing the structured submission.
      const r2 = await create({ model, max_tokens: 8000, system, tools, tool_choice: { type: 'tool', name: 'submit_result' }, messages: [...cur, { role: 'assistant', content: r.content }, { role: 'user', content: 'Submit your result now with submit_result, using only what you verified above.' }] });
      track(r2);
      const s2 = (r2.content || []).find((b) => b.type === 'tool_use' && b.name === 'submit_result');
      if (s2) result = s2.input || {};
    }
    break;
  }
  if (!resultSchema && !finalText.trim()) finalText = ctx.created.length ? `Done. Created ${ctx.created.length} item(s) in Helm.` : 'I could not complete that. Please try rephrasing.';
  const text = resultSchema ? finalText : withSources(finalText, sources);
  if (opts.log !== false) console.log(JSON.stringify({ event: 'rd_advisor', mode, task, model, ...usage, sources: sources.size, created: ctx.created.length }));
  return { text, result, model, usage, created: ctx.created, sources: [...sources].map(([url, title]) => ({ url, title })), seenUrls: seen, seenHosts: new Set([...seen].map(host).filter(Boolean)) };
}

// For structured supplier results: keep a link only if it (or its site) came back from a search or fetch.
function verifiedLink(url, run) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  if (run.seenUrls.has(url)) return url;
  const h = host(url); return h && run.seenHosts.has(h) ? url : null;
}

function makeClient(factory) {
  return (factory || ((apiKey) => { const Anthropic = require('@anthropic-ai/sdk'); return new Anthropic({ apiKey }); }))((process.env.ANTHROPIC_API_KEY || '').trim());
}

module.exports = { runAdvisor, resolveUserDb, restClient, makeClient, verifiedLink, collectSources, collectSeenUrls, withSources, trimHistory, normalize, MODELS };
