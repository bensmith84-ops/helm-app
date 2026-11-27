// PLM tools for the R&D Advisor: tool definitions (Anthropic schema) and their
// implementation against a PostgREST client bound to the calling user (RLS applies).
const crypto = require('crypto');
const C = require('./calc');

const enc = encodeURIComponent;
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== null && o[k] !== undefined && o[k] !== '').map((k) => [k, o[k]]));
const inList = (ids) => `in.(${[...new Set(ids)].filter(Boolean).map((x) => `"${String(x).replace(/"/g, '')}"`).join(',')})`;
const today = () => new Date().toISOString().slice(0, 10);
const S = (props, required = []) => ({ type: 'object', properties: props, required });
const str = (d) => ({ type: 'string', description: d });
const n = (d) => ({ type: 'number', description: d });

const DOE_DESIGNS = ['full_factorial', 'fractional_factorial', 'plackett_burman', 'box_behnken', 'central_composite', 'taguchi', 'mixture_design', 'simplex_lattice', 'simplex_centroid', 'd_optimal', 'one_factor_at_a_time', 'screening', 'optimization', 'response_surface', 'custom', 'none'];
const EXP_TYPES = ['formulation', 'process', 'stability', 'efficacy', 'safety', 'sensory', 'packaging', 'shelf_life', 'dissolution', 'compatibility', 'accelerated_aging', 'photostability', 'other'];
const FACTOR = { type: 'object', properties: { name: str('Factor name, e.g. "PVOH %" or "Drying temp"'), unit: str('Unit'), low: n('Low level (continuous)'), high: n('High level (continuous)'), levels: { type: 'array', items: { type: 'string' }, description: 'Explicit levels, for categorical factors (e.g. supplier grades)' } }, required: ['name'] };

const READ_TOOLS = [
  { name: 'list_programs', description: 'List Earth Breeze PLM programs (id, name, type, category, stage). Use to find a program.', input_schema: S({ search: str('Optional case-insensitive name filter') }) },
  { name: 'get_program', description: 'One program: brief, stage, markets, channels, desired claims, cost and margin targets, formulations, SKUs, recent experiments, open issues, and counts of tests, claims and sourcing items.', input_schema: S({ program_id: str('Program id') }, ['program_id']) },
  { name: 'get_formulation', description: 'A formulation with all its ingredient items (% w/w or batch amount, function, phase, notes) and its targets (pH, viscosity, density, process).', input_schema: S({ formulation_id: str('Formulation id') }, ['formulation_id']) },
  { name: 'analyze_formulation', description: 'Exact analysis of a formulation: % totals and data checks, ingredient classes and total surfactant, compatibility warnings, raw-material cost per kg and per unit (prices from the ingredient library; optional what-if prices), and batch amounts. Use this for any number about a formula.', input_schema: S({ formulation_id: str('Formulation id'), unit_weight_g: n('Weight of one unit (sheet, tablet, dose) in grams, if known; otherwise taken from a linked SKU'), price_overrides: { type: 'object', additionalProperties: { type: 'number' }, description: 'What-if prices per kg by ingredient name, e.g. {"Protease": 38}' }, batch_size: n('Optional batch size to scale to'), batch_unit: str('Batch unit: g, kg, lb') }, ['formulation_id']) },
  { name: 'compare_formulations', description: 'Ingredient-by-ingredient difference between two formulations (added, removed, changed %).', input_schema: S({ from_formulation_id: str('Older/base formulation'), to_formulation_id: str('Newer formulation') }, ['from_formulation_id', 'to_formulation_id']) },
  { name: 'screen_ingredients', description: 'Screen ingredients against a regulatory and claims watchlist (phosphates, 1,4-dioxane risk from ethoxylates, EDTA, isothiazolinones, formaldehyde releasers, boron, quats, PFAS, microplastics, fragrance allergens, enzymes, brighteners, dyes, etc.) plus flags in the ingredient library. Give a formulation_id or a list of ingredient names.', input_schema: S({ formulation_id: str('Formulation id'), ingredients: { type: 'array', items: { type: 'string' }, description: 'Ingredient names or INCI names' } }) },
  { name: 'search_ingredient_library', description: "Search Earth Breeze's ingredient library (INCI, CAS, type, regulatory flags) with suppliers on file and their price tiers.", input_schema: S({ search: str('Name, INCI, CAS or type') }, ['search']) },
  { name: 'get_test_results', description: 'Test results for a program (optionally one formulation): spec vs. result, pass/fail (recomputed from the spec where possible), conditions and dates.', input_schema: S({ program_id: str('Program id'), formulation_id: str('Optional formulation id') }, ['program_id']) },
  { name: 'get_experiment', description: 'An experiment with its factors, responses, run table and recorded results, plus a main-effects analysis of the results.', input_schema: S({ experiment_id: str('Experiment id') }, ['experiment_id']) },
  { name: 'get_claims', description: 'Claims for a program (text, type, status, evidence level, legal status, substantiation) and its evidence documents.', input_schema: S({ program_id: str('Program id') }, ['program_id']) },
  { name: 'get_sourcing', description: "A program's sourcing items (ingredients, packaging, contract manufacturers) with suppliers and price tiers, and its RFPs with providers and submitted quotes.", input_schema: S({ program_id: str('Program id') }, ['program_id']) },
  { name: 'compare_quotes', description: 'Landed cost per unit for every quote on an RFP at a given volume: applies the right price tier, exchange rates, freight, duty and other costs, and flags MOQ conflicts. Use for any quote comparison.', input_schema: S({ rfp_id: str('RFP id'), volume: n('Annual or order volume in units to compare at'), freight_per_unit: n('Freight per unit in target currency (default 0)'), duty_pct: n('Import duty % on the unit price (default 0)'), other_per_unit: n('Other per-unit cost, e.g. packaging or warehousing (default 0)'), fx: { type: 'object', additionalProperties: { type: 'number' }, description: 'Exchange rates into the target currency, e.g. {"EUR":1.08,"CNY":0.14}' }, target_currency: str('Default USD') }, ['rfp_id', 'volume']) },
  { name: 'design_experiment', description: 'Generate a DOE run table: full_factorial, fractional_factorial (2-level half fraction), plackett_burman (screening up to 11 factors), box_behnken or central_composite (response surface), simplex_lattice (mixture, components with min/max summing to a total). Returns runs with settings; does not save anything.', input_schema: S({ design: { type: 'string', enum: ['full_factorial', 'fractional_factorial', 'plackett_burman', 'box_behnken', 'central_composite', 'simplex_lattice'] }, factors: { type: 'array', items: FACTOR }, components: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, min: { type: 'number' }, max: { type: 'number' } }, required: ['name'] }, description: 'Mixture components (simplex_lattice)' }, degree: n('Lattice degree for mixtures (default 2)'), total: n('Mixture total, e.g. 100 for %, or the share being varied'), center_points: n('Centre points for response-surface designs (default 3)'), replicates: n('Replicates (default 1)'), randomize: { type: 'boolean' } }, ['design']) },
];

const WRITE_TOOLS = [
  { name: 'create_formulation', description: 'Create a new formulation under a program. Only when the user asks.', input_schema: S({ program_id: str(''), name: str(''), version: str('e.g. v1.0'), form_type: { type: 'string', enum: ['liquid', 'gel', 'powder', 'tablet', 'film', 'sachet', 'spray', 'paste', 'bar', 'suspension', 'solution', 'other'] }, target_batch_size: n(''), batch_size_unit: str(''), target_ph: n(''), lab_notes: str(''), manufacturing_process: str(''), parent_formula_id: str('Formulation this one is derived from') }, ['program_id', 'name']) },
  { name: 'add_formula_items', description: 'Add ingredient items to a formulation in one call. Only when the user asks.', input_schema: S({ formulation_id: str(''), items: { type: 'array', items: S({ ingredient_name: str(''), quantity: n('% w/w'), unit: str('default %'), function_in_formula: str(''), phase: str(''), notes: str(''), sort_order: n('') }, ['ingredient_name', 'quantity']) } }, ['formulation_id', 'items']) },
  { name: 'create_experiment', description: 'Create one experiment with its factors, responses and (optionally) the run table from design_experiment, so the lab can record results in Helm. Only when the user asks.', input_schema: S({ program_id: str(''), formulation_id: str(''), name: str(''), description: str(''), hypothesis: str(''), experiment_type: { type: 'string', enum: EXP_TYPES }, doe_design: { type: 'string', enum: DOE_DESIGNS }, factors: { type: 'array', items: FACTOR }, responses: { type: 'array', items: S({ name: str('e.g. Dissolution time at 20 C'), unit: str('e.g. s'), target: str('e.g. < 60'), direction: { type: 'string', enum: ['maximize', 'minimize', 'target'] } }, ['name']) }, runs: { type: 'array', items: { type: 'object' }, description: 'Runs from design_experiment (each with settings keyed by factor name)' }, planned_start: str('YYYY-MM-DD'), planned_end: str('YYYY-MM-DD') }, ['program_id', 'name']) },
  { name: 'save_supplier', description: "Save a supplier or contract manufacturer you verified on the web into Helm. target 'program' adds a sourcing item to the program; target 'ingredient' adds a supplier to an ingredient in the library. Only when the user asks, and only with a source_url from this conversation.", input_schema: S({ target: { type: 'string', enum: ['program', 'ingredient'] }, program_id: str('For target program'), ingredient_id: str('For target ingredient (library id)'), sourcing_type: { type: 'string', enum: ['ingredient', 'packaging', 'contract_manufacturer', 'other'] }, item_name: str('What is being sourced, e.g. "Dish tablet contract manufacturing" or "MGDA 40% solution"'), supplier_name: str(''), website: str(''), country: str(''), source_url: str('Page that verifies the facts'), verified_facts: str('What the source confirms'), open_questions: str('What still needs asking'), moq: n('Only if published'), moq_unit: str(''), lead_time_days: n('Only if published') }, ['target', 'supplier_name', 'source_url']) },
];

const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

// ───────── data helpers ─────────
async function itemsOf(db, formulationId) {
  return db.get(`/plm_formula_items?select=*&formulation_id=eq.${enc(formulationId)}&order=sort_order.asc`);
}
// Current price per kg for library ingredients: preferred supplier first, current price row, smallest-quantity tier.
async function libraryPrices(db, items) {
  const ids = items.map((i) => i.ingredient_id).filter(Boolean);
  const names = items.filter((i) => !i.ingredient_id).map((i) => i.ingredient_name).filter(Boolean);
  let lib = [];
  if (ids.length) lib = lib.concat(await db.get(`/plm_ingredient_library?select=id,name,inci_name,regulatory_flags&id=${inList(ids)}`).catch(() => []));
  if (names.length) {
    const all = await db.get('/plm_ingredient_library?select=id,name,inci_name,regulatory_flags&limit=1000').catch(() => []);
    const want = new Set(names.map(C.norm));
    lib = lib.concat(all.filter((l) => want.has(C.norm(l.name)) || want.has(C.norm(l.inci_name))));
  }
  const libIds = [...new Set(lib.map((l) => l.id))];
  const sups = libIds.length ? await db.get(`/plm_ingredient_suppliers?select=id,ingredient_id,supplier_name,is_preferred,status&ingredient_id=${inList(libIds)}`).catch(() => []) : [];
  const pr = sups.length ? await db.get(`/plm_ingredient_pricing?select=*&supplier_id=${inList(sups.map((s) => s.id))}`).catch(() => []) : [];
  const t = today(); const prices = {}; const flags = {};
  for (const l of lib) {
    if (l.regulatory_flags && Object.keys(l.regulatory_flags).length) { flags[l.id] = l.regulatory_flags; flags[C.norm(l.name)] = l.regulatory_flags; }
    const ss = sups.filter((s) => s.ingredient_id === l.id && s.status !== 'disqualified' && s.status !== 'inactive').sort((a, b) => (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0));
    for (const s of ss) {
      const rows = pr.filter((p) => p.supplier_id === s.id && (!p.effective_date || p.effective_date <= t) && (!p.expiry_date || p.expiry_date >= t)).map((p) => ({ ...p, perKg: C.pricePerKg(p.unit_price, p.uom || 'kg') })).filter((p) => p.perKg != null).sort((a, b) => (Number(a.min_qty) || 0) - (Number(b.min_qty) || 0));
      if (rows.length) {
        const p = { price_per_kg: rows[0].perKg, currency: rows[0].currency || 'USD', supplier: s.supplier_name, source: `library price${rows.length > 1 ? ` (smallest-quantity tier of ${rows.length})` : ''}`, best_tier_per_kg: C.round(Math.min(...rows.map((r) => r.perKg)), 4) };
        prices[l.id] = p; prices[C.norm(l.name)] = p; if (l.inci_name) prices[C.norm(l.inci_name)] = p; break;
      }
    }
  }
  // link items without ingredient_id by name
  for (const it of items) if (!it.ingredient_id) { const m = lib.find((l) => C.norm(l.name) === C.norm(it.ingredient_name) || C.norm(l.inci_name) === C.norm(it.ingredient_name)); if (m) it.ingredient_id = m.id; }
  return { prices, flags };
}

// Map the experiment UI's id-keyed run table to name-keyed rows.
function runsFromExperiment(exp, runRows) {
  const fName = Object.fromEntries((Array.isArray(exp.factors) ? exp.factors : []).map((f) => [f.id, f.name || f.id]));
  const rName = Object.fromEntries((Array.isArray(exp.responses) ? exp.responses : []).map((r) => [r.id, r.name || r.id]));
  const fromMatrix = (Array.isArray(exp.run_matrix) ? exp.run_matrix : []).map((r) => ({
    run: r.run_number,
    factor_settings: Object.fromEntries(Object.entries(r.factor_values || {}).map(([k, v]) => [fName[k] || k, v])),
    response_results: Object.fromEntries(Object.entries(r.response_values || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [rName[k] || k, v])),
    notes: r.notes || undefined,
  }));
  const fromRows = (runRows || []).map((r) => ({ run: r.run_number, factor_settings: r.factor_settings || {}, response_results: r.response_results || {}, status: r.status, notes: r.notes || r.post_run_notes || undefined }));
  return fromMatrix.concat(fromRows);
}

async function runTool(db, ctx, name, input = {}) {
  switch (name) {
    case 'list_programs': {
      const rows = await db.get('/plm_programs?select=id,name,program_type,category,current_stage&deleted_at=is.null&order=name.asc&limit=300');
      const s = (input.search || '').toLowerCase();
      return rows.filter((p) => !s || String(p.name || '').toLowerCase().includes(s)).map((p) => pick(p, ['id', 'name', 'program_type', 'category', 'current_stage']));
    }
    case 'get_program': {
      const id = enc(input.program_id);
      const [prog] = await db.get(`/plm_programs?select=*&id=eq.${id}`);
      if (!prog) return { error: 'program not found' };
      const safe = (p) => p.catch(() => []);
      const [forms, exps, issues, tests, claims, sourcing, skus] = await Promise.all([
        db.get(`/plm_formulations?select=id,name,version,status,form_type,parent_formula_id,raw_material_cost_per_unit,total_cogs_per_unit,updated_at&program_id=eq.${id}&order=created_at.desc&limit=40`),
        safe(db.get(`/plm_experiments?select=id,name,status,experiment_type,doe_design,hypothesis,conclusions&program_id=eq.${id}&order=created_at.desc&limit=15`)),
        safe(db.get(`/plm_issues?select=id,title,severity,status,issue_type,root_cause&program_id=eq.${id}&status=neq.resolved&order=created_at.desc&limit=20`)),
        safe(db.get(`/plm_test_results?select=status&program_id=eq.${id}`)),
        safe(db.get(`/plm_claims?select=status&program_id=eq.${id}`)),
        safe(db.get(`/plm_sourcing?select=sourcing_type,status&program_id=eq.${id}`)),
        safe(db.get(`/plm_skus?select=id,name,sku_code,formulation_id,net_weight,weight_unit,unit_cogs,target_retail,status&program_id=eq.${id}`)),
      ]);
      const count = (rows, k) => rows.reduce((o, r) => ((o[r[k] || 'unknown'] = (o[r[k] || 'unknown'] || 0) + 1), o), {});
      return {
        program: pick(prog, ['id', 'name', 'code', 'description', 'program_type', 'category', 'subcategory', 'brand', 'current_stage', 'stage_entered_at', 'priority', 'target_launch_date', 'target_market', 'target_consumer', 'target_markets_v2', 'channels_v2', 'desired_claims', 'target_gross_margin_pct', 'target_unit_price', 'projected_margin_pct', 'development_budget', 'regulatory_pathway', 'regulatory_status']),
        formulations: forms.map((f) => pick(f, ['id', 'name', 'version', 'status', 'form_type', 'parent_formula_id', 'raw_material_cost_per_unit', 'total_cogs_per_unit', 'updated_at'])),
        skus, experiments: exps, open_issues: issues,
        counts: { tests: count(tests, 'status'), claims: count(claims, 'status'), sourcing: count(sourcing, 'sourcing_type') },
      };
    }
    case 'get_formulation': {
      const [f] = await db.get(`/plm_formulations?select=*&id=eq.${enc(input.formulation_id)}`);
      if (!f) return { error: 'formulation not found' };
      const items = await itemsOf(db, input.formulation_id);
      return {
        formulation: pick(f, ['id', 'program_id', 'name', 'version', 'status', 'form_type', 'target_batch_size', 'batch_size_unit', 'target_ph', 'ph_range_low', 'ph_range_high', 'target_viscosity', 'viscosity_unit', 'target_density', 'shelf_life_months', 'storage_conditions', 'manufacturing_process', 'process_parameters', 'lab_notes', 'stability_notes', 'parent_formula_id']),
        items: items.map((it) => pick(it, ['ingredient_name', 'quantity', 'unit', 'quantity_min', 'quantity_max', 'function_in_formula', 'phase', 'addition_order', 'addition_temp_c', 'notes', 'ingredient_id'])),
      };
    }
    case 'analyze_formulation': {
      const [f] = await db.get(`/plm_formulations?select=id,name,version,program_id,target_batch_size,batch_size_unit&id=eq.${enc(input.formulation_id)}`);
      if (!f) return { error: 'formulation not found' };
      const items = await itemsOf(db, input.formulation_id);
      if (!items.length) return { formulation: f.name, error: 'This formulation has no ingredient items yet.' };
      const { prices, flags } = await libraryPrices(db, items);
      let unitWeightG = C.num(input.unit_weight_g); let unitSource = unitWeightG ? 'given' : null;
      if (!unitWeightG) {
        const skus = await db.get(`/plm_skus?select=name,net_weight,weight_unit&formulation_id=eq.${enc(input.formulation_id)}`).catch(() => []);
        const s = skus.find((x) => C.massToGrams(x.net_weight, x.weight_unit || 'g') != null);
        if (s) { unitWeightG = C.massToGrams(s.net_weight, s.weight_unit || 'g'); unitSource = `SKU ${s.name} net weight (check whether that is per pack or per unit)`; }
      }
      const out = C.analyzeFormula(items, { prices, overrides: input.price_overrides || {}, unitWeightG, batchSize: C.num(input.batch_size), batchUnit: input.batch_unit });
      out.formulation = `${f.name} ${f.version || ''}`.trim();
      if (unitSource) out.cost.unit_weight_source = unitSource;
      out.screen = C.screenIngredients(items.map((i) => ({ ...i, pct: out.items.find((x) => x.ingredient === i.ingredient_name)?.pct })), flags);
      return out;
    }
    case 'compare_formulations': {
      const [a, b] = await Promise.all([itemsOf(db, input.from_formulation_id), itemsOf(db, input.to_formulation_id)]);
      return C.compareFormulas(a, b);
    }
    case 'screen_ingredients': {
      let items = [];
      if (input.formulation_id) items = await itemsOf(db, input.formulation_id);
      for (const nm of input.ingredients || []) items.push({ ingredient_name: nm });
      if (!items.length) return { error: 'Give a formulation_id or ingredient names.' };
      const { flags } = await libraryPrices(db, items).catch(() => ({ flags: {} }));
      return C.screenIngredients(items.map((i) => ({ ...i, pct: C.num(i.quantity) })), flags);
    }
    case 'search_ingredient_library': {
      const q = String(input.search || '').replace(/[%*,()"]/g, ' ').trim();
      if (!q) return [];
      const like = `*${q}*`;
      const lib = await db.get(`/plm_ingredient_library?select=id,name,inci_name,cas_number,ingredient_type,category,description,regulatory_flags,notes&or=(name.ilike.${enc(like)},inci_name.ilike.${enc(like)},cas_number.ilike.${enc(like)},ingredient_type.ilike.${enc(like)},category.ilike.${enc(like)})&limit=25`);
      if (!lib.length) return { results: [], note: 'Nothing in the ingredient library matches.' };
      const sups = await db.get(`/plm_ingredient_suppliers?select=id,ingredient_id,supplier_name,country,website,moq,moq_uom,lead_time_days,is_preferred,status&ingredient_id=${inList(lib.map((l) => l.id))}`).catch(() => []);
      const pr = sups.length ? await db.get(`/plm_ingredient_pricing?select=supplier_id,min_qty,max_qty,unit_price,currency,uom,effective_date,expiry_date&supplier_id=${inList(sups.map((s) => s.id))}`).catch(() => []) : [];
      return { results: lib.map((l) => ({ ...pick(l, ['id', 'name', 'inci_name', 'cas_number', 'ingredient_type', 'category', 'description', 'regulatory_flags', 'notes']), suppliers: sups.filter((s) => s.ingredient_id === l.id).map((s) => ({ ...pick(s, ['supplier_name', 'country', 'website', 'moq', 'moq_uom', 'lead_time_days', 'is_preferred', 'status']), prices: pr.filter((p) => p.supplier_id === s.id).map((p) => ({ ...pick(p, ['min_qty', 'max_qty', 'unit_price', 'currency', 'uom', 'effective_date', 'expiry_date']), price_per_kg: C.round(C.pricePerKg(p.unit_price, p.uom || 'kg'), 4) })) })) })) };
    }
    case 'get_test_results': {
      let q = `/plm_test_results?select=*&program_id=eq.${enc(input.program_id)}&order=tested_date.desc.nullslast&limit=300`;
      if (input.formulation_id) q += `&formulation_id=eq.${enc(input.formulation_id)}`;
      return C.summarizeTests(await db.get(q));
    }
    case 'get_experiment': {
      const [e] = await db.get(`/plm_experiments?select=*&id=eq.${enc(input.experiment_id)}`);
      if (!e) return { error: 'experiment not found' };
      const runRows = await db.get(`/plm_experiment_runs?select=*&experiment_id=eq.${enc(input.experiment_id)}&order=run_number.asc`).catch(() => []);
      const runs = runsFromExperiment(e, runRows);
      return { experiment: pick(e, ['id', 'name', 'description', 'hypothesis', 'experiment_type', 'doe_design', 'status', 'conclusions', 'recommendations', 'planned_start', 'planned_end']), factors: e.factors, responses: e.responses, runs: runs.slice(0, 120), analysis: C.analyzeRuns(runs) };
    }
    case 'get_claims': {
      const id = enc(input.program_id);
      const [prog] = await db.get(`/plm_programs?select=desired_claims,claims_substantiation,target_markets_v2&id=eq.${id}`).catch(() => [null]);
      const claims = await db.get(`/plm_claims?select=claim_text,claim_type,claim_category,status,evidence_level,substantiation_summary,supporting_studies,legal_status,legal_notes,target_benefit,priority&program_id=eq.${id}&order=priority.asc.nullslast`).catch(() => []);
      const docs = await db.get(`/plm_claim_documents?select=title,doc_type,url,notes,claim_refs&program_id=eq.${id}`).catch(() => []);
      return { desired_claims: prog?.desired_claims || [], claims_substantiation: prog?.claims_substantiation || null, target_markets: prog?.target_markets_v2 || [], claims, evidence_documents: docs };
    }
    case 'get_sourcing': {
      const id = enc(input.program_id);
      const [items, rfps] = await Promise.all([
        db.get(`/plm_sourcing?select=id,sourcing_type,name,description,supplier_name,supplier_url,lead_time_days,moq,moq_unit,status,notes,volume_tiers&program_id=eq.${id}`).catch(() => []),
        db.get(`/plm_rfps?select=id,name,rfp_type,status,due_date,target_volume,target_volume_unit,target_unit_price,currency,awarded_provider_id&program_id=eq.${id}`).catch(() => []),
      ]);
      let providers = [], subs = [];
      if (rfps.length) {
        const r = inList(rfps.map((x) => x.id));
        [providers, subs] = await Promise.all([
          db.get(`/plm_rfp_providers?select=id,rfp_id,company_name,country,website,status,ai_score&rfp_id=${r}`).catch(() => []),
          db.get(`/plm_rfp_submissions?select=rfp_id,rfp_provider_id,submission_name,variant_label,manufacturing_location,base_unit_price,base_currency,base_moq,base_moq_unit,max_break_quantity,max_break_unit_price,volume_tiers,lead_time_days,ramp_time_days,payment_terms,fob_location,certifications,status,ai_score&rfp_id=${r}`).catch(() => []),
        ]);
      }
      return { sourcing_items: items, rfps: rfps.map((x) => ({ ...x, providers: providers.filter((p) => p.rfp_id === x.id).map((p) => ({ ...pick(p, ['company_name', 'country', 'website', 'status', 'ai_score']), submissions: subs.filter((s) => s.rfp_provider_id === p.id).map((s) => pick(s, ['submission_name', 'variant_label', 'manufacturing_location', 'base_unit_price', 'base_currency', 'base_moq', 'base_moq_unit', 'max_break_quantity', 'max_break_unit_price', 'volume_tiers', 'lead_time_days', 'ramp_time_days', 'payment_terms', 'fob_location', 'certifications', 'status'])) })) })) };
    }
    case 'compare_quotes': {
      const id = enc(input.rfp_id);
      const [rfp] = await db.get(`/plm_rfps?select=name,currency,target_unit_price,target_volume&id=eq.${id}`);
      if (!rfp) return { error: 'RFP not found' };
      const [providers, subs, resps] = await Promise.all([
        db.get(`/plm_rfp_providers?select=id,company_name,country&rfp_id=eq.${id}`).catch(() => []),
        db.get(`/plm_rfp_submissions?select=*&rfp_id=eq.${id}`).catch(() => []),
        db.get(`/plm_rfp_responses?select=*&rfp_id=eq.${id}`).catch(() => []),
      ]);
      const pname = Object.fromEntries(providers.map((p) => [p.id, p.company_name]));
      const quotes = subs.map((s) => ({ name: [pname[s.rfp_provider_id] || 'Unknown', s.submission_name || s.variant_label].filter(Boolean).join(' · '), currency: s.base_currency, base_unit_price: s.base_unit_price, volume_tiers: [...(s.volume_tiers || []), ...(s.max_break_quantity && s.max_break_unit_price ? [{ volume: s.max_break_quantity, unit_price: s.max_break_unit_price }] : [])], moq: s.base_moq, lead_time_days: s.lead_time_days, fob: s.fob_location, location: s.manufacturing_location, certifications: s.certifications }))
        .concat(resps.map((r) => ({ name: `${pname[r.rfp_provider_id] || 'Unknown'} (line item)`, currency: r.currency, base_unit_price: r.unit_price, volume_tiers: r.volume_tiers, moq: r.moq, lead_time_days: r.lead_time_days, certifications: r.certifications })));
      if (!quotes.length) return { rfp: rfp.name, error: 'No quotes have been recorded on this RFP yet.' };
      const out = C.landedCost(quotes, { volume: C.num(input.volume), freight_per_unit: C.num(input.freight_per_unit) || 0, duty_pct: C.num(input.duty_pct) || 0, other_per_unit: C.num(input.other_per_unit) || 0, fx: input.fx || {}, target_currency: input.target_currency || rfp.currency || 'USD', target_unit_price: C.num(rfp.target_unit_price) });
      return { rfp: rfp.name, target_unit_price: rfp.target_unit_price, ...out };
    }
    case 'design_experiment':
      return C.designExperiment(input);

    // ───── writes ─────
    case 'create_formulation': {
      const row = await db.insert('plm_formulations', { org_id: ctx.orgId, program_id: input.program_id, name: input.name, version: input.version || 'v1.0', status: 'draft', form_type: input.form_type || null, target_batch_size: input.target_batch_size || null, batch_size_unit: input.batch_size_unit || 'g', target_ph: input.target_ph ?? null, lab_notes: input.lab_notes || null, manufacturing_process: input.manufacturing_process || null, parent_formula_id: input.parent_formula_id || null, created_by: ctx.userId });
      ctx.created.push({ type: 'formulation', tool: 'create_formulation', name: row?.name, id: row?.id, result: { name: row?.name } });
      return { success: true, formulation_id: row?.id };
    }
    case 'add_formula_items': {
      const rows = (input.items || []).map((it, i) => ({ org_id: ctx.orgId, formulation_id: input.formulation_id, ingredient_name: it.ingredient_name, quantity: it.quantity, unit: it.unit || '%', function_in_formula: it.function_in_formula || null, phase: it.phase || null, notes: it.notes || null, sort_order: it.sort_order ?? i }));
      const out = await db.insertMany('plm_formula_items', rows);
      ctx.created.push({ type: 'formula_items', tool: 'add_formula_items', result: { message: `${(out || []).length} ingredients added` } });
      return { success: true, items_added: (out || []).length };
    }
    case 'create_experiment': {
      // Store factors / responses / runs in the shape the Experiments screen edits.
      const factors = (input.factors || []).map((f) => ({ id: crypto.randomUUID(), name: f.name, unit: f.unit || '', type: Array.isArray(f.levels) && f.levels.length && f.low == null ? 'categorical' : 'continuous', low: f.low ?? '', high: f.high ?? '', levels: f.levels || [] }));
      const responses = (input.responses || []).map((r) => ({ id: crypto.randomUUID(), name: r.name, unit: r.unit || '', target: r.target || '', direction: r.direction || 'maximize' }));
      const run_matrix = (input.runs || []).map((r, i) => { const st = r.settings || r.factor_settings || r; return { id: crypto.randomUUID(), run_number: r.run || i + 1, factor_values: Object.fromEntries(factors.map((f) => [f.id, st[f.name] ?? ''])), response_values: Object.fromEntries(responses.map((x) => [x.id, ''])), notes: r.replicate > 1 ? `Replicate ${r.replicate}` : '' }; });
      const row = await db.insert('plm_experiments', { org_id: ctx.orgId, program_id: input.program_id, formulation_id: input.formulation_id || null, name: input.name, description: input.description || null, hypothesis: input.hypothesis || null, experiment_type: EXP_TYPES.includes(input.experiment_type) ? input.experiment_type : 'formulation', doe_design: DOE_DESIGNS.includes(input.doe_design) ? input.doe_design : (run_matrix.length ? 'custom' : 'none'), status: 'planning', factors, responses, run_matrix, planned_start: input.planned_start || null, planned_end: input.planned_end || null, created_by: ctx.userId });
      ctx.created.push({ type: 'experiment', tool: 'create_experiment', name: row?.name, id: row?.id, result: { name: `${row?.name}${run_matrix.length ? ` (${run_matrix.length} runs)` : ''}` } });
      return { success: true, experiment_id: row?.id, runs: run_matrix.length };
    }
    case 'save_supplier': {
      if (!/^https?:\/\//.test(input.source_url || '')) return { error: 'A source_url from this conversation is required.' };
      const note = [`Verified ${today()} by the R&D Advisor from ${input.source_url}`, input.verified_facts && `Confirmed: ${input.verified_facts}`, input.open_questions && `To ask: ${input.open_questions}`].filter(Boolean).join('\n');
      if (input.target === 'ingredient') {
        if (!input.ingredient_id) return { error: 'ingredient_id (library id) is required for target ingredient. Use search_ingredient_library to find it.' };
        const row = await db.insert('plm_ingredient_suppliers', { org_id: ctx.orgId, ingredient_id: input.ingredient_id, supplier_name: input.supplier_name, website: input.website || null, country: input.country || null, moq: input.moq ?? null, moq_uom: input.moq_unit || null, lead_time_days: input.lead_time_days ?? null, is_preferred: false, status: 'evaluating', notes: note });
        ctx.created.push({ type: 'supplier', tool: 'save_supplier', name: input.supplier_name, id: row?.id, result: { message: `${input.supplier_name} added to the ingredient library (evaluating)` } });
        return { success: true, id: row?.id };
      }
      if (!input.program_id) return { error: 'program_id is required for target program.' };
      const row = await db.insert('plm_sourcing', { org_id: ctx.orgId, program_id: input.program_id, sourcing_type: input.sourcing_type || 'contract_manufacturer', name: input.item_name || input.supplier_name, supplier_name: input.supplier_name, supplier_url: input.website || input.source_url, moq: input.moq ?? null, moq_unit: input.moq_unit || null, lead_time_days: input.lead_time_days ?? null, status: 'considering', notes: note, created_by: ctx.userId });
      ctx.created.push({ type: 'supplier', tool: 'save_supplier', name: input.supplier_name, id: row?.id, result: { message: `${input.supplier_name} added to the program's sourcing (considering)` } });
      return { success: true, id: row?.id };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

module.exports = { READ_TOOLS, WRITE_TOOLS, ALL_TOOLS, runTool, runsFromExperiment, libraryPrices };
