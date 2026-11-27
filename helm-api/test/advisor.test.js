// node --test helm-api/test
const test = require('node:test');
const assert = require('node:assert');
const { runAdvisor, verifiedLink } = require('../src/lib/advisor/engine');
const { runTool } = require('../src/lib/advisor/tools');

// ── tiny in-memory PostgREST stand-in ──
function fakeDb(tables) {
  const parse = (path) => {
    const [t, qs] = path.replace(/^\//, '').split('?');
    const filters = [];
    for (const part of (qs || '').split('&')) {
      const [k, v] = part.split('='); if (!v || ['select', 'order', 'limit'].includes(k)) continue;
      const val = decodeURIComponent(v);
      if (val.startsWith('eq.')) filters.push((r) => String(r[k]) === val.slice(3));
      else if (val.startsWith('neq.')) filters.push((r) => String(r[k]) !== val.slice(4));
      else if (val.startsWith('in.(')) { const set = val.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')); filters.push((r) => set.includes(String(r[k]))); }
      else if (val === 'is.null') filters.push((r) => r[k] == null);
    }
    return { t, filters };
  };
  const inserts = [];
  return {
    inserts,
    get: async (path) => { const { t, filters } = parse(path); return (tables[t] || []).filter((r) => filters.every((f) => f(r))); },
    insert: async (t, row) => { const r = { id: `${t}-${inserts.length + 1}`, ...row }; inserts.push([t, r]); (tables[t] = tables[t] || []).push(r); return r; },
    insertMany: async (t, rows) => rows.map((row, i) => { const r = { id: `${t}-m${i}`, ...row }; inserts.push([t, r]); return r; }),
  };
}
const TABLES = () => ({
  plm_programs: [{ id: 'p1', name: 'Dish Tabs', current_stage: 'development', desired_claims: ['Phosphate free'], target_markets_v2: ['US'] }],
  plm_formulations: [{ id: 'f1', program_id: 'p1', name: 'DT base', version: 'v3', status: 'testing' }],
  plm_formula_items: [
    { formulation_id: 'f1', ingredient_name: 'Sodium Carbonate', quantity: 40, unit: '%', function_in_formula: 'builder', ingredient_id: 'L1', sort_order: 1 },
    { formulation_id: 'f1', ingredient_name: 'Sodium Percarbonate', quantity: 15, unit: '%', function_in_formula: 'bleach', sort_order: 2 },
    { formulation_id: 'f1', ingredient_name: 'MGDA', quantity: 20, unit: '%', function_in_formula: 'chelant', sort_order: 3 },
    { formulation_id: 'f1', ingredient_name: 'Protease', quantity: 2, unit: '%', function_in_formula: 'enzyme', sort_order: 4 },
    { formulation_id: 'f1', ingredient_name: 'Fatty alcohol ethoxylate EO/PO', quantity: 3, unit: '%', function_in_formula: 'low foam nonionic', sort_order: 5 },
    { formulation_id: 'f1', ingredient_name: 'Sodium Sulfate', quantity: 20, unit: '%', function_in_formula: 'filler', sort_order: 6 },
  ],
  plm_ingredient_library: [{ id: 'L1', name: 'Sodium Carbonate', inci_name: 'Sodium Carbonate' }, { id: 'L2', name: 'Sodium Percarbonate' }],
  plm_ingredient_suppliers: [{ id: 'S1', ingredient_id: 'L1', supplier_name: 'Soda Co', is_preferred: true, status: 'approved' }, { id: 'S2', ingredient_id: 'L2', supplier_name: 'Perox', status: 'active' }],
  plm_ingredient_pricing: [{ supplier_id: 'S1', min_qty: 1000, unit_price: 0.35, currency: 'USD', uom: 'kg' }, { supplier_id: 'S1', min_qty: 20000, unit_price: 0.3, currency: 'USD', uom: 'kg' }, { supplier_id: 'S2', min_qty: 0, unit_price: 0.55, currency: 'USD', uom: 'lb' }],
  plm_skus: [{ formulation_id: 'f1', name: 'Dish Tab 20g', net_weight: 20, weight_unit: 'g' }],
  plm_rfps: [{ id: 'r1', name: 'Dish tab CM', currency: 'USD', target_unit_price: 0.12 }],
  plm_rfp_providers: [{ id: 'pv1', rfp_id: 'r1', company_name: 'TabCo' }, { id: 'pv2', rfp_id: 'r1', company_name: 'EuroTab' }],
  plm_rfp_submissions: [{ rfp_id: 'r1', rfp_provider_id: 'pv1', base_unit_price: 0.14, base_currency: 'USD', volume_tiers: [{ volume: 500000, unit_price: 0.11 }], base_moq: 250000 }, { rfp_id: 'r1', rfp_provider_id: 'pv2', base_unit_price: 0.09, base_currency: 'EUR', volume_tiers: [] }],
  plm_rfp_responses: [],
  plm_experiments: [{ id: 'e1', program_id: 'p1', name: 'Dissolution DOE', factors: [{ id: 'fa', name: 'Force' }], responses: [{ id: 'ra', name: 'Dissolve s' }], run_matrix: [{ run_number: 1, factor_values: { fa: 10 }, response_values: { ra: 40 } }, { run_number: 2, factor_values: { fa: 20 }, response_values: { ra: 70 } }] }],
  plm_experiment_runs: [],
  org_memberships: [],
});

test('analyze_formulation: totals, classes, library prices, unit cost from SKU, screen', async () => {
  const db = fakeDb(TABLES());
  const r = await runTool(db, {}, 'analyze_formulation', { formulation_id: 'f1', price_overrides: { MGDA: 1.9 } });
  assert.equal(r.total_pct, 100);
  assert.equal(r.class_totals.bleach.pct, 15);
  assert.equal(r.class_totals.filler.pct, 20, 'sodium sulfate is filler, not an anionic');
  // carbonate 40% x 0.35 + percarbonate 15% x (0.55/lb = 1.2125/kg) + MGDA 20% x 1.9 = 0.14 + 0.1819 + 0.38
  assert.ok(Math.abs(r.cost.raw_material_cost_per_kg - 0.7019) < 0.001, String(r.cost.raw_material_cost_per_kg));
  assert.equal(r.cost.unit_weight_g, 20);
  assert.ok(Math.abs(r.cost.raw_material_cost_per_unit - 0.014) < 0.0005);
  assert.deepEqual(r.cost.missing_prices.sort(), ['Fatty alcohol ethoxylate EO/PO', 'Protease', 'Sodium Sulfate']);
  const ids = r.screen.hits.flatMap((h) => h.flags.map((f) => f.id));
  assert.ok(ids.includes('dioxane') && ids.includes('enzyme') && ids.includes('oxidiser'));
  assert.ok(r.checks.some((c) => /Bleach and enzymes/.test(c)));
});

test('compare_quotes: tiers, fx, MOQ flag, ranking', async () => {
  const db = fakeDb(TABLES());
  const r = await runTool(db, {}, 'compare_quotes', { rfp_id: 'r1', volume: 300000, freight_per_unit: 0.01, fx: { EUR: 1.1 } });
  assert.equal(r.ranked[0].name, 'EuroTab');
  assert.ok(Math.abs(r.ranked[0].landed_unit_cost - 0.109) < 1e-6);
  const tab = r.ranked.find((x) => x.name === 'TabCo');
  assert.equal(tab.unit_price, 0.14, 'below the 500k tier uses the base price');
  const r2 = await runTool(db, {}, 'compare_quotes', { rfp_id: 'r1', volume: 100000 });
  assert.ok(r2.ranked.find((x) => x.name === 'TabCo').notes.some((n) => /MOQ/.test(n)));
});

test('get_experiment reads the UI run table by name and analyses it', async () => {
  const r = await runTool(fakeDb(TABLES()), {}, 'get_experiment', { experiment_id: 'e1' });
  assert.equal(r.analysis.responses['Dissolve s'].factors_ranked[0].effect_low_to_high, 30);
});

test('create_experiment stores factors, responses and runs in the screen format', async () => {
  const db = fakeDb(TABLES()); const ctx = { userId: 'u1', orgId: 'o1', created: [] };
  const design = await runTool(db, ctx, 'design_experiment', { design: 'full_factorial', factors: [{ name: 'PVOH %', low: 30, high: 40 }, { name: 'Glycerin %', low: 5, high: 10 }], randomize: false });
  assert.equal(design.run_count, 4);
  const out = await runTool(db, ctx, 'create_experiment', { program_id: 'p1', name: 'Sheet DOE', doe_design: 'full_factorial', factors: [{ name: 'PVOH %', low: 30, high: 40 }, { name: 'Glycerin %', low: 5, high: 10 }], responses: [{ name: 'Dissolution', unit: 's', direction: 'minimize' }], runs: design.runs });
  assert.equal(out.runs, 4);
  const [t, row] = db.inserts.find(([t]) => t === 'plm_experiments');
  const fid = row.factors[0].id;
  assert.equal(row.run_matrix[0].factor_values[fid], 30);
  assert.equal(row.org_id, 'o1');
  assert.equal(ctx.created.length, 1);
});

test('save_supplier requires a source and writes a note with it', async () => {
  const db = fakeDb(TABLES()); const ctx = { userId: 'u1', orgId: 'o1', created: [] };
  assert.ok((await runTool(db, ctx, 'save_supplier', { target: 'program', program_id: 'p1', supplier_name: 'X' })).error);
  await runTool(db, ctx, 'save_supplier', { target: 'program', program_id: 'p1', supplier_name: 'TabCo', source_url: 'https://tabco.example/caps', verified_facts: 'rotary presses' });
  const row = db.inserts.find(([t]) => t === 'plm_sourcing')[1];
  assert.match(row.notes, /tabco\.example/); assert.equal(row.status, 'considering');
});

// ── scripted model ──
function scripted(responses) {
  const calls = [];
  return { calls, messages: { create: async (params) => { calls.push(params); const r = responses.shift(); if (!r) throw new Error('no more scripted responses'); return { usage: { input_tokens: 10, output_tokens: 5 }, ...r }; } } };
}

test('chat loop: tools run, sources appended, chemist knowledge in system prompt', async () => {
  const client = scripted([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'analyze_formulation', input: { formulation_id: 'f1' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Raw material cost is $0.0140 per tab.', citations: [{ url: 'https://example.com/a', title: 'A' }] }] },
  ]);
  const run = await runAdvisor({ client, db: fakeDb(TABLES()), userId: 'u', orgId: 'o', question: 'what does a tab cost?', program_id: 'p1', log: false });
  assert.match(run.text, /0\.0140/); assert.match(run.text, /\*\*Sources\*\*/);
  const sys = client.calls[0].system.map((b) => b.text).join('\n');
  assert.match(sys, /PhD/); assert.match(sys, /Mode: Chemist/); assert.match(sys, /Dish Tabs \(id p1\)/);
  assert.ok(client.calls[0].tools.some((t) => t.name === 'web_search') && client.calls[0].tools.some((t) => t.name === 'compare_quotes'));
  const toolResult = client.calls[1].messages.at(-1).content[0];
  assert.equal(toolResult.type, 'tool_result'); assert.match(toolResult.content, /raw_material_cost_per_kg/);
});

test('model fallback when the first model id is unavailable', async () => {
  let n = 0;
  const client = { messages: { create: async (p) => { n++; if (p.model === 'nope') { const e = new Error('model: not found'); e.status = 404; throw e; } return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: {} }; } } };
  const run = await runAdvisor({ client, db: fakeDb(TABLES()), question: 'hi', models: ['nope', 'good'], log: false });
  assert.equal(run.model, 'good'); assert.equal(run.text, 'ok'); assert.equal(n, 2);
});

test('structured: submit_result captured; unverified links detectable; writes off', async () => {
  const client = scripted([
    { stop_reason: 'tool_use', content: [
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'MGDA supplier' } },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://www.realchem.com/mgda', title: 'MGDA' }] },
      { type: 'tool_use', id: 'u1', name: 'submit_result', input: { results: [{ ingredient_name: 'MGDA', supplier_name: 'RealChem', source_url: 'https://www.realchem.com/mgda', supplier_website: 'https://realchem.com', fit_score: 80, reasoning: 'r' }, { ingredient_name: 'MGDA', supplier_name: 'Ghost', source_url: 'https://ghost.example/x', fit_score: 90, reasoning: 'r' }] } },
    ] },
  ]);
  const run = await runAdvisor({ client, db: fakeDb(TABLES()), question: 'find MGDA', mode: 'sourcing', task: 'find_ingredient_suppliers', resultSchema: { type: 'object', properties: {} }, allowWrites: false, log: false });
  assert.equal(run.result.results.length, 2);
  assert.equal(verifiedLink('https://www.realchem.com/mgda', run), 'https://www.realchem.com/mgda');
  assert.equal(verifiedLink('https://realchem.com', run), 'https://realchem.com', 'same site counts');
  assert.equal(verifiedLink('https://ghost.example/x', run), null);
  const names = client.calls[0].tools.map((t) => t.name);
  assert.ok(!names.includes('create_formulation') && names.includes('submit_result'));
  assert.equal(client.calls[0].tools.find((t) => t.name === 'web_search').max_uses, 15, 'sourcing mode gets a bigger search budget');
});

test('structured: forces submit_result if the model answers in prose', async () => {
  const client = scripted([
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is my review...' }] },
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u', name: 'submit_result', input: { readiness_score: 40 } }] },
  ]);
  const run = await runAdvisor({ client, db: fakeDb(TABLES()), question: 'ready?', task: 'stage_readiness', resultSchema: { type: 'object', properties: {} }, allowWrites: false, log: false });
  assert.equal(run.result.readiness_score, 40);
  assert.deepEqual(client.calls[1].tool_choice, { type: 'tool', name: 'submit_result' });
});

// ── route level: /rd-advisor through Supabase-style auth with a fake fetch ──
function fakeFetch(tables) {
  const db = fakeDb(tables);
  return async (url, opts = {}) => {
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.endsWith('/auth/v1/user')) return ok({ id: 'u1', email: 'ben@example.com' });
    const path = u.split('/rest/v1')[1];
    if (opts.method === 'POST') { const t = path.slice(1); const body = JSON.parse(opts.body); return ok(Array.isArray(body) ? await db.insertMany(t, body) : [await db.insert(t, body)]); }
    return ok(await db.get(path));
  };
}
async function callRoute(body, scriptedResponses) {
  process.env.ANTHROPIC_API_KEY = 'test';
  const routes = {}; const app = { post: (p, h) => (routes[p] = h), all: () => {} };
  const t = TABLES(); t.org_memberships = [{ user_id: 'u1', org_id: 'o1', is_active: true, role: 'admin' }];
  const client = scripted(scriptedResponses);
  require('../src/routes/rd-advisor')(app, { pool: {}, verifyFirebase: async () => { throw new Error('not firebase'); }, anthropicFactory: () => client, fetchImpl: fakeFetch(t) });
  let out; const res = { status: () => res, json: (x) => (out = x) };
  await routes['/rd-advisor']({ headers: { authorization: 'Bearer tok' }, body }, res);
  return { out, client };
}

test('route: supplier finder keeps only results backed by a page found in the search', async () => {
  const { out } = await callRoute({ action: 'find_ingredient_suppliers', program_id: 'p1', request: { search_type: 'exact', ingredient_name: 'MGDA' } }, [
    { stop_reason: 'tool_use', content: [
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://www.realchem.com/mgda' }] },
      { type: 'tool_use', id: 'x', name: 'submit_result', input: { results: [
        { ingredient_name: 'MGDA', supplier_name: 'RealChem', source_url: 'https://www.realchem.com/mgda', supplier_website: 'https://madeup.example', fit_score: 81.6, reasoning: 'Verified: grade page.' },
        { ingredient_name: 'MGDA', supplier_name: 'Ghost', source_url: 'https://ghost.example/x', fit_score: 90, reasoning: 'r' }] } } ] },
  ]);
  assert.equal(out.success, true);
  assert.equal(out.results.length, 1); assert.equal(out.dropped_unverified, 1);
  assert.equal(out.results[0].ai_fit_score, 82); assert.equal(out.results[0].supplier_website, null, 'unverified website removed');
});

test('route: chat persists the conversation and passes the mode', async () => {
  const { out, client } = await callRoute({ question: 'Why are sheets brittle?', program_id: 'p1', mode: 'rfp' }, [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Low plasticiser.' }] }]);
  assert.equal(out.success, true); assert.equal(out.mode, 'rfp'); assert.ok(out.conversation_id);
  assert.match(client.calls[0].system.map((b) => b.text).join(''), /Mode: RFP and quotes/);
});
