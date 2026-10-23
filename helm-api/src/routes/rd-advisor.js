// POST /rd-advisor - Earth Breeze R&D Advisor (PLM "AI Advisor" panel), v2.
//
// What changed from plm-ai v1 and why (see PR description):
//   - Real research: Anthropic web search + web fetch server tools. Supplier,
//     CMO and price answers must come from sources found in this conversation,
//     with links. v1 was instructed to "name real companies" with no way to look
//     anything up, so it invented companies, phone numbers and capabilities.
//   - Honesty rules in the system prompt: never invent contact details or
//     capabilities; say what is verified vs. not; fetch URLs the user gives.
//   - Portfolio on demand: a compact index of programs goes in the prompt; full
//     formulas are read through tools only when a question needs them.
//   - Answers sized to the question instead of one giant report per turn.
//
// Serves both backends with one code path. Data is read and written through a
// PostgREST-compatible endpoint AS THE USER (row-level security applies):
//   - Supabase (today's live app): the request carries the user's Supabase
//     session token; we verify it with Supabase Auth and call Supabase REST.
//   - Google Cloud (after cutover / preview): the request carries a Firebase
//     token; we use POSTGREST_URL with a minted JWT (lib/postgrest.js).
// The auth gate lists this route as public because it authenticates itself
// (either token type) and requires an active Helm org membership.

const { mintJwt, identityToken } = require('../lib/postgrest');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://upbjdmnykheubxkuknuj.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4';
const MODELS = (process.env.RD_ADVISOR_MODELS || 'claude-sonnet-5-5,claude-sonnet-4-6').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_ROUNDS = 12;
const HISTORY_MESSAGES = 12;
const HISTORY_CHARS = 6000;

// ---------- auth + data access ----------

async function supabaseUser(token, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

// Minimal PostgREST client bound to one caller.
function restClient({ base, headers, fetchImpl = fetch }) {
  const call = async (method, path, { body, prefer } = {}) => {
    const h = { ...(await headers()), Accept: 'application/json' };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    const r = await fetchImpl(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} ${r.status}: ${(data && data.message) || text.slice(0, 200)}`);
    return data;
  };
  return {
    get: (path) => call('GET', path),
    insert: (table, row) => call('POST', `/${table}`, { body: row, prefer: 'return=representation' }).then((d) => (Array.isArray(d) ? d[0] : d)),
    insertMany: (table, rows) => call('POST', `/${table}`, { body: rows, prefer: 'return=representation' }),
  };
}

async function resolveCaller(req, { verifyFirebase, fetchImpl = fetch }) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: [401, 'Sign in required'] };

  // Google Cloud: Firebase token -> profile via firebase_uid, data via PostgREST.
  let fb = null;
  try { fb = await verifyFirebase(token); } catch { fb = null; }
  if (fb) {
    const pgBase = process.env.POSTGREST_URL;
    if (!pgBase) return { error: [503, 'R&D Advisor data service not configured (POSTGREST_URL)'] };
    // The profile id (needed to mint the JWT) is resolved from firebase_uid by
    // the route, using helm-api's own database pool.
    return { firebase: fb, base: pgBase.replace(/\/+$/, ''), svcHeaders, pending: true, backend: 'gcp' };
  }

  // Supabase: verify the session token with Supabase Auth.
  const su = await supabaseUser(token, { fetchImpl });
  if (!su) return { error: [401, 'Session expired - refresh the page and try again'] };
  const db = restClient({ base: `${SUPABASE_URL}/rest/v1`, fetchImpl, headers: async () => ({ apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }) });
  return { userId: su.id, email: su.email, db, backend: 'supabase' };
}

async function svcHeaders(base) {
  if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) return {};
  return { 'X-Serverless-Authorization': `Bearer ${await identityToken(base)}` };
}

// ---------- prompt ----------

const SYSTEM_PROMPT = `You are the R&D Advisor inside Helm, Earth Breeze's internal operating system. Earth Breeze makes eco-friendly home care products (laundry detergent sheets, laundry/dish/toilet tablets, sachets, scent boosters, liquids, powders). You work with the R&D, operations and leadership team. Think of yourself as a senior formulation scientist, manufacturing engineer and sourcing lead in one.

# What you can do
- Read Earth Breeze's real programs and formulas through the PLM tools (list_programs, get_program, get_formulation). Read only what the question needs.
- Research suppliers, contract manufacturers, ingredients, prices and regulations with web_search, and read specific pages with web_fetch.
- Create formulations, formula items and experiments in Helm when asked (create_formulation, add_formula_items, create_experiment).

# Truthfulness (most important)
- Facts about specific outside companies (that they exist, location, equipment, capabilities, certifications, MOQs, lead times, prices, phone numbers, emails, websites) must come from a web_search or web_fetch result in THIS conversation. Link the source next to the claim, e.g. [Company site](https://...).
- Never invent or guess contact details, URLs, equipment lists, MOQs or lead times. If you could not find something, say "not found" or "not published", and say what to ask the supplier instead.
- Separate what you verified from your own judgment, e.g. "Verified: rotary tablet presses (their site). My assessment: likely fits Dish Tabs, confirm enzyme handling."
- When the user gives a URL or a specific company name, fetch or search it before answering. If two companies share a name, say so and confirm which one.
- If research fails or returns nothing, say so plainly. Don't fill gaps with plausible-sounding detail. It's fine to say you don't know.
- If you got something wrong earlier, correct it plainly once and move on.
- General technical knowledge (chemistry, processing, typical parameters) doesn't need a source, but flag rules of thumb as typical rather than as Earth Breeze-specific.

# Using Earth Breeze data
- Base formula-specific advice on the actual formula items from get_formulation, citing the exact ingredients and % w/w you rely on. Don't describe formulas you haven't read.
- Program names and IDs are in the portfolio index below. Use get_program to see its formulations before referring to them.
- Never create, change or delete data unless the user asks. When they do, call the tools, then confirm briefly what was created.

# How to answer
- Answer the question that was asked, at the length it needs. A quick question gets a few sentences. A sourcing request gets a short ranked shortlist (usually 3-6) with why each fits, what's verified, and the open questions. Don't write a full report unless asked.
- Lead with the answer or recommendation, then the reasoning.
- If the request is ambiguous in a way that changes the answer (e.g. which product line, region, volume), ask one short clarifying question first, or state your assumption and proceed.
- Use markdown: short headings, bullets, and simple tables (header row + |---| separator) when comparing options. No decorative emoji, star ratings or giant banners.
- End with sources (links) when you used the web, and at most one concrete next step you can do for them (e.g. draft an RFQ, create experiments).`;

// ---------- tools ----------

const PLM_TOOLS = [
  { name: 'list_programs', description: 'List Earth Breeze PLM programs (id, name, type, category, stage). Use to find a program before reading its formulas.', input_schema: { type: 'object', properties: { search: { type: 'string', description: 'Optional case-insensitive name filter' } } } },
  { name: 'get_program', description: 'Get one program with its formulations (id, name, version, status, form type) and recent experiments.', input_schema: { type: 'object', properties: { program_id: { type: 'string' } }, required: ['program_id'] } },
  { name: 'get_formulation', description: 'Get a formulation with all its ingredient items (% w/w, function, phase, notes).', input_schema: { type: 'object', properties: { formulation_id: { type: 'string' } }, required: ['formulation_id'] } },
  { name: 'create_formulation', description: 'Create a new formulation under a program. Only when the user asks.', input_schema: { type: 'object', properties: { program_id: { type: 'string' }, name: { type: 'string' }, version: { type: 'string' }, form_type: { type: 'string' }, target_batch_size: { type: 'number' }, batch_size_unit: { type: 'string' }, lab_notes: { type: 'string' }, manufacturing_process: { type: 'string' } }, required: ['program_id', 'name'] } },
  { name: 'add_formula_items', description: 'Add ingredient items to a formulation in one call. Only when the user asks.', input_schema: { type: 'object', properties: { formulation_id: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { ingredient_name: { type: 'string' }, quantity: { type: 'number', description: '% w/w' }, unit: { type: 'string' }, function_in_formula: { type: 'string' }, phase: { type: 'string' }, notes: { type: 'string' }, sort_order: { type: 'number' } }, required: ['ingredient_name', 'quantity'] } } }, required: ['formulation_id', 'items'] } },
  { name: 'create_experiment', description: 'Create one experiment/trial (call once per trial). Only when the user asks.', input_schema: { type: 'object', properties: { program_id: { type: 'string' }, formulation_id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, hypothesis: { type: 'string' }, experiment_type: { type: 'string', enum: ['formulation', 'process', 'stability', 'efficacy', 'safety', 'sensory', 'packaging', 'shelf_life', 'dissolution', 'compatibility', 'other'] }, doe_design: { type: 'string', enum: ['full_factorial', 'fractional_factorial', 'screening', 'optimization', 'response_surface', 'custom', 'none'] }, factors: { type: 'object' }, responses: { type: 'object' }, planned_start: { type: 'string' }, planned_end: { type: 'string' } }, required: ['program_id', 'name'] } },
];
const SERVER_TOOLS = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
  { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 6, citations: { enabled: true }, max_content_tokens: 12000 },
];

const enc = encodeURIComponent;
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== null && o[k] !== undefined && o[k] !== '').map((k) => [k, o[k]]));

async function runTool(db, ctx, name, input) {
  switch (name) {
    case 'list_programs': {
      const rows = await db.get('/plm_programs?select=*&deleted_at=is.null&order=name.asc&limit=200');
      const s = (input.search || '').toLowerCase();
      return rows.filter((p) => !s || String(p.name || '').toLowerCase().includes(s)).map((p) => pick(p, ['id', 'name', 'program_type', 'category', 'current_stage', 'status']));
    }
    case 'get_program': {
      const [prog] = await db.get(`/plm_programs?select=*&id=eq.${enc(input.program_id)}`);
      if (!prog) return { error: 'program not found' };
      const forms = await db.get(`/plm_formulations?select=*&program_id=eq.${enc(input.program_id)}&order=created_at.desc&limit=40`);
      const exps = await db.get(`/plm_experiments?select=*&program_id=eq.${enc(input.program_id)}&order=created_at.desc&limit=15`).catch(() => []);
      return {
        program: pick(prog, ['id', 'name', 'program_type', 'category', 'current_stage', 'status', 'description', 'target_launch_date']),
        formulations: forms.map((f) => pick(f, ['id', 'name', 'version', 'status', 'form_type', 'target_batch_size', 'batch_size_unit', 'updated_at'])),
        experiments: exps.map((e) => pick(e, ['id', 'name', 'status', 'experiment_type', 'hypothesis'])),
      };
    }
    case 'get_formulation': {
      const [f] = await db.get(`/plm_formulations?select=*&id=eq.${enc(input.formulation_id)}`);
      if (!f) return { error: 'formulation not found' };
      const items = await db.get(`/plm_formula_items?select=*&formulation_id=eq.${enc(input.formulation_id)}&order=sort_order.asc`);
      return {
        formulation: pick(f, ['id', 'program_id', 'name', 'version', 'status', 'form_type', 'target_batch_size', 'batch_size_unit', 'lab_notes', 'manufacturing_process']),
        items: items.map((it) => pick(it, ['ingredient_name', 'quantity', 'unit', 'function_in_formula', 'phase', 'notes'])),
      };
    }
    case 'create_formulation': {
      const row = await db.insert('plm_formulations', { program_id: input.program_id, name: input.name, version: input.version || 'v1.0', status: 'draft', form_type: input.form_type || null, target_batch_size: input.target_batch_size || null, batch_size_unit: input.batch_size_unit || 'g', lab_notes: input.lab_notes || null, manufacturing_process: input.manufacturing_process || null, created_by: ctx.userId });
      ctx.created.push({ type: 'formulation', name: row?.name, id: row?.id, result: { name: row?.name } });
      return { success: true, formulation_id: row?.id };
    }
    case 'add_formula_items': {
      const rows = (input.items || []).map((it, i) => ({ formulation_id: input.formulation_id, ingredient_name: it.ingredient_name, quantity: it.quantity, unit: it.unit || '%', function_in_formula: it.function_in_formula || null, phase: it.phase || null, notes: it.notes || null, sort_order: it.sort_order ?? i }));
      const out = await db.insertMany('plm_formula_items', rows);
      ctx.created.push({ type: 'formula_items', result: { message: `${(out || []).length} ingredients added` } });
      return { success: true, items_added: (out || []).length };
    }
    case 'create_experiment': {
      const row = await db.insert('plm_experiments', { program_id: input.program_id, formulation_id: input.formulation_id || null, name: input.name, description: input.description || null, hypothesis: input.hypothesis || null, experiment_type: input.experiment_type || 'formulation', doe_design: input.doe_design || 'none', status: 'planning', factors: input.factors || null, responses: input.responses || null, planned_start: input.planned_start || null, planned_end: input.planned_end || null, created_by: ctx.userId });
      ctx.created.push({ type: 'experiment', name: row?.name, id: row?.id, result: { name: row?.name } });
      return { success: true, experiment_id: row?.id };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

// Collect cited sources (url -> title) from text-block citations.
function collectSources(content) {
  const out = new Map();
  for (const b of content || []) {
    if (b.type !== 'text' || !Array.isArray(b.citations)) continue;
    for (const c of b.citations) if (c.url && !out.has(c.url)) out.set(c.url, c.title || c.url);
  }
  return out;
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

// Anthropic requires alternating roles starting with user.
function normalize(messages) {
  const out = [];
  for (const m of messages) {
    if (!out.length && m.role !== 'user') continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1] = { role: m.role, content: `${out[out.length - 1].content}\n\n${m.content}` };
    else out.push(m);
  }
  return out;
}

module.exports = function mount(app, { pool, anthropicFactory, verifyFirebase, fetchImpl = fetch } = {}) {
  const makeClient = anthropicFactory || ((apiKey) => { const Anthropic = require('@anthropic-ai/sdk'); return new Anthropic({ apiKey }); });
  const verifyFb = verifyFirebase || ((t) => require('firebase-admin').auth().verifyIdToken(t));

  app.post('/rd-advisor', async (req, res) => {
    const started = Date.now();
    try {
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.json({ success: false, error: 'ANTHROPIC_API_KEY not set' });

      // --- who is calling, and how we reach their data ---
      const caller = await resolveCaller(req, { verifyFirebase: verifyFb, fetchImpl });
      if (caller.error) return res.status(caller.error[0]).json({ success: false, error: caller.error[1] });
      let db = caller.db; let userId = caller.userId;
      if (caller.pending) {
        const { rows } = await pool.query('SELECT id FROM profiles WHERE firebase_uid = $1 LIMIT 1', [caller.firebase.sub]);
        if (!rows[0]) return res.status(403).json({ success: false, error: 'No Helm profile for this sign-in' });
        userId = rows[0].id;
        const base = caller.base;
        db = restClient({ base, fetchImpl, headers: async () => ({ ...(await caller.svcHeaders(base)), Authorization: `Bearer ${mintJwt({ sub: userId, role: 'authenticated', email: caller.firebase.email })}` }) });
      }
      const memberships = await db.get(`/org_memberships?select=org_id,role&user_id=eq.${enc(userId)}&is_active=eq.true`).catch(() => []);
      if (!memberships.length) return res.status(403).json({ success: false, error: 'Helm membership required' });
      const orgId = memberships[0].org_id;

      const { question, conversation_id, program_id, history } = req.body || {};
      if (!question || !String(question).trim()) return res.json({ success: false, error: 'Question is required' });

      // --- compact portfolio index + active program (cheap, cached) ---
      let index = '';
      try {
        const progs = await runTool(db, {}, 'list_programs', {});
        index = progs.map((p) => `- ${p.name} | id ${p.id}${p.program_type ? ` | ${p.program_type}` : ''}${p.current_stage ? ` | stage ${p.current_stage}` : ''}`).join('\n');
      } catch (e) { index = `(could not load programs: ${e.message})`; }
      let active = '';
      if (program_id) {
        try { const p = await runTool(db, {}, 'get_program', { program_id }); if (p.program) active = `The user has this program open: ${p.program.name} (id ${p.program.id}). Formulations: ${p.formulations.map((f) => `${f.name} ${f.version || ''} (id ${f.id})`).join('; ') || 'none'}.`; } catch {}
      }
      const today = new Date().toISOString().slice(0, 10);
      const system = [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Today is ${today}.\n\n# Earth Breeze portfolio index\n${index}\n\n${active}`.trim() },
      ];

      const messages = normalize([...trimHistory(history), { role: 'user', content: String(question).trim() }]);
      const tools = [...SERVER_TOOLS, ...PLM_TOOLS];
      const client = makeClient(apiKey);
      const ctx = { userId, created: [] };
      const usage = { input_tokens: 0, output_tokens: 0, web_searches: 0, web_fetches: 0 };
      const sources = new Map();
      let model = MODELS[0]; let finalText = '';
      let cur = messages;

      const create = async (params) => {
        for (let mi = MODELS.indexOf(model); mi < MODELS.length; mi++) {
          try {
            return await client.messages.create({ ...params, model: MODELS[mi] }, { headers: { 'anthropic-beta': 'web-fetch-2025-09-10' } });
          } catch (e) {
            const notFound = e?.status === 404 || /model/i.test(e?.message || '') && /not.?found|invalid/i.test(e?.message || '');
            if (!notFound || mi === MODELS.length - 1) throw e;
            model = MODELS[mi + 1];
          }
        }
      };

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const r = await create({ model, max_tokens: 8000, system, tools, messages: cur });
        usage.input_tokens += r.usage?.input_tokens || 0;
        usage.output_tokens += r.usage?.output_tokens || 0;
        usage.web_searches += r.usage?.server_tool_use?.web_search_requests || 0;
        usage.web_fetches += r.usage?.server_tool_use?.web_fetch_requests || 0;
        for (const [u, t] of collectSources(r.content)) sources.set(u, t);
        const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        if (r.stop_reason === 'pause_turn') { cur = [...cur, { role: 'assistant', content: r.content }]; finalText += text; continue; }
        const calls = (r.content || []).filter((b) => b.type === 'tool_use');
        if (r.stop_reason === 'tool_use' && calls.length) {
          const results = [];
          for (const c of calls) {
            let out;
            try { out = await runTool(db, ctx, c.name, c.input || {}); } catch (e) { out = { error: e.message }; }
            results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out).slice(0, 60000) });
          }
          cur = [...cur, { role: 'assistant', content: r.content }, { role: 'user', content: results }];
          finalText = ''; // only keep text from the final answer turn
          continue;
        }
        finalText += text;
        break;
      }
      if (!finalText.trim()) finalText = ctx.created.length ? `Done - created ${ctx.created.length} item(s) in Helm.` : 'I could not complete that. Please try rephrasing.';
      const response = withSources(finalText, sources);

      // --- persist (as the user, RLS applies) ---
      let convId = conversation_id || null;
      try {
        if (!convId) {
          const c = await db.insert('plm_ai_conversations', { org_id: orgId, program_id: program_id || null, user_id: userId, title: String(question).slice(0, 80) });
          convId = c?.id || null;
        }
        if (convId) {
          await db.insertMany('plm_ai_messages', [
            { conversation_id: convId, role: 'user', content: String(question) },
            { conversation_id: convId, role: 'assistant', content: response, tokens_in: usage.input_tokens, tokens_out: usage.output_tokens },
          ]);
        }
      } catch (e) { console.error('[rd-advisor] persist failed:', e.message); }

      const duration_ms = Date.now() - started;
      console.log(JSON.stringify({ event: 'rd_advisor', backend: caller.backend || 'gcp', model, duration_ms, ...usage, sources: sources.size, created: ctx.created.length }));
      return res.json({ success: true, response, conversation_id: convId, model, usage, duration_ms, created_items: ctx.created, sources: [...sources].map(([url, title]) => ({ url, title })) });
    } catch (e) {
      console.error('[rd-advisor]', e?.status || '', e?.message);
      return res.json({ success: false, error: e?.message || String(e) });
    }
  });
};

module.exports._internal = { SYSTEM_PROMPT, PLM_TOOLS, SERVER_TOOLS, runTool, collectSources, withSources, trimHistory, normalize, resolveCaller, restClient };
