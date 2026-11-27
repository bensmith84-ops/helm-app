// POST /rd-advisor - Earth Breeze R&D Advisor (PLM "AI agent" tab and every PLM AI feature).
//
// v3: one engine (lib/advisor) for chat and structured tasks.
//   - A PhD-level detergent chemist knowledge base (fabrics, dishes, surfaces,
//     stains, enzymes, surfactants, builders, bleach, polymers, sheets/tablets).
//   - Exact tools for formula totals, cost per kg/unit, ingredient screening,
//     test results, DOE design and analysis, landed-cost quote comparison.
//   - Web search + fetch for every outside fact, with sources.
//   - Modes: chemist (default), sourcing, rfp.
//   - Actions: chat (default), find_ingredient_suppliers, review (claims_review | stage_readiness).
//
// Authenticates itself (Supabase session or Firebase token) and reads/writes data
// AS THE USER through PostgREST, so row-level security applies.
const { runAdvisor, resolveUserDb, makeClient, verifiedLink } = require('../lib/advisor/engine');

const arr = (items) => ({ type: 'array', items });
const s = { type: 'string' }; const nn = { type: 'number', description: 'Leave out unless a source publishes it' }; const sn = { type: 'string' };

const SUPPLIER_SCHEMA = { type: 'object', properties: {
  results: arr({ type: 'object', properties: {
    ingredient_name: s, inci_name: sn, trade_name: sn, cas_number: sn, function: sn, grade: sn,
    supplier_name: s, supplier_website: sn, origin_country: sn, certifications: arr(s),
    price_per_kg: nn, currency: sn, moq_kg: nn, lead_time_days: nn,
    claims_compatible: arr(s), fit_score: { type: 'number' }, reasoning: s, source_url: s,
  }, required: ['ingredient_name', 'supplier_name', 'fit_score', 'reasoning', 'source_url'] }),
  notes: s,
}, required: ['results'] };

const REVIEW_SCHEMAS = {
  claims_review: { type: 'object', properties: {
    overall_assessment: s,
    claim_reviews: arr({ type: 'object', properties: { claim: s, feasibility: { type: 'string', enum: ['high', 'medium', 'low'] }, evidence_strength: { type: 'string', enum: ['strong', 'moderate', 'weak', 'none'] }, regulatory_risk: { type: 'string', enum: ['high', 'medium', 'low'] }, gaps: arr(s), recommendations: arr(s), supporting_ingredients: arr(s), conflicting_ingredients: arr(s) }, required: ['claim', 'feasibility', 'evidence_strength', 'regulatory_risk'] }),
    ingredient_flags: arr({ type: 'object', properties: { ingredient: s, concern: s, markets: arr(s), source_url: sn }, required: ['ingredient', 'concern'] }),
    next_steps: arr(s),
  }, required: ['overall_assessment', 'claim_reviews', 'next_steps'] },
  stage_readiness: { type: 'object', properties: {
    current_stage: s, next_stage: s, readiness_score: { type: 'number', description: '0-100' }, summary: s,
    blockers: arr({ type: 'object', properties: { item: s, severity: { type: 'string', enum: ['critical', 'major', 'minor'] }, why: s, next_action: s }, required: ['item', 'severity'] }),
    ready_items: arr(s),
    checklist: arr({ type: 'object', properties: { item: s, status: { type: 'string', enum: ['complete', 'in_progress', 'not_started'] }, required: { type: 'boolean' }, evidence: s }, required: ['item', 'status'] }),
  }, required: ['current_stage', 'next_stage', 'readiness_score', 'summary', 'blockers', 'checklist'] },
};

function supplierQuestion(req) {
  const what = req.search_type === 'exact' ? `Find suppliers and grades for the ingredient "${req.ingredient_name}". Include INCI and CAS where a source gives them, and several supplier options.`
    : req.search_type === 'function' ? `Suggest 4-8 ingredients (named grades and their producers or distributors) that serve this function: "${req.desired_function}". Explain the chemistry of why each fits.`
    : `Suggest 4-8 ingredients (named grades and their producers or distributors) that achieve this outcome: "${req.desired_outcome}". Explain the mechanism and typical use level.`;
  return [what,
    `Claims the ingredient must be compatible with: ${(req.claims_compatibility || []).join(', ') || 'none specified'}.`,
    `Restrictions (avoid): ${(req.restrictions || []).join(', ') || 'none'}.`,
    `Target cost: ${req.target_cost_per_kg ? `$${req.target_cost_per_kg}/kg` : 'not specified'}.`,
    req.additional_requirements ? `Also: ${req.additional_requirements}` : null,
  ].filter(Boolean).join('\n');
}

module.exports = function mount(app, { pool, anthropicFactory, verifyFirebase, fetchImpl = fetch } = {}) {
  const verifyFb = verifyFirebase || ((t) => require('firebase-admin').auth().verifyIdToken(t));

  app.post('/rd-advisor', async (req, res) => {
    const started = Date.now();
    try {
      if (!(process.env.ANTHROPIC_API_KEY || '').trim()) return res.json({ success: false, error: 'ANTHROPIC_API_KEY not set' });
      const who = await resolveUserDb(req, { pool, verifyFirebase: verifyFb, fetchImpl });
      if (who.error) return res.status(who.error[0]).json({ success: false, error: who.error[1] });
      const client = makeClient(anthropicFactory);
      const body = req.body || {};
      const base = { client, db: who.db, userId: who.userId, orgId: who.orgId };

      // ── structured: ingredient supplier finder ──
      if (body.action === 'find_ingredient_suppliers') {
        const r = body.request || {};
        const run = await runAdvisor({ ...base, mode: 'sourcing', task: 'find_ingredient_suppliers', question: supplierQuestion(r), program_id: body.program_id || r.program_id, resultSchema: SUPPLIER_SCHEMA, allowWrites: false });
        const list = Array.isArray(run.result?.results) ? run.result.results : [];
        const results = []; let dropped = 0;
        for (const x of list) {
          const src = verifiedLink(x.source_url, run);
          if (!src) { dropped++; continue; } // no page backs it up: leave it out
          results.push({
            ingredient_name: x.ingredient_name, inci_name: x.inci_name || null, trade_name: x.trade_name || null, cas_number: x.cas_number || null, grade: x.grade || null,
            supplier_name: x.supplier_name, supplier_website: verifiedLink(x.supplier_website, run) || null, origin_country: x.origin_country || null,
            certifications: x.certifications || [], price_per_kg: x.price_per_kg ?? null, currency: x.currency || null, moq_kg: x.moq_kg ?? null, lead_time_days: x.lead_time_days ?? null,
            claims_compatible: x.claims_compatible || [], ai_fit_score: Math.round(Number(x.fit_score) || 0), ai_reasoning: x.reasoning, source_url: src,
          });
        }
        return res.json({ success: true, results, notes: run.result?.notes || null, dropped_unverified: dropped, model: run.model, usage: run.usage, duration_ms: Date.now() - started });
      }

      // ── structured: claims review / stage readiness ──
      if (body.action === 'review') {
        const type = REVIEW_SCHEMAS[body.review_type] ? body.review_type : 'stage_readiness';
        if (!body.program_id) return res.status(400).json({ success: false, error: 'program_id required' });
        const q = type === 'claims_review' ? `Review every desired and recorded claim for program ${body.program_id}: can the formula deliver it, how strong is the evidence, what is the regulatory risk in its target markets, and what is missing.`
          : `Assess whether program ${body.program_id} is ready to leave its current stage, and give the checklist for the gate.`;
        const run = await runAdvisor({ ...base, mode: 'chemist', task: type, question: q, program_id: body.program_id, resultSchema: REVIEW_SCHEMAS[type], allowWrites: false });
        if (!run.result) return res.json({ success: false, error: 'The review did not finish. Try again.' });
        return res.json({ success: true, review_type: type, result: run.result, sources: run.sources, model: run.model, usage: run.usage, generated_at: new Date().toISOString(), duration_ms: Date.now() - started });
      }

      // ── chat ──
      const { question, conversation_id, program_id, rfp_id, history, context } = body;
      const mode = ['chemist', 'sourcing', 'rfp'].includes(body.mode) ? body.mode : 'chemist';
      if (!question || !String(question).trim()) return res.json({ success: false, error: 'Question is required' });
      const run = await runAdvisor({ ...base, mode, question, history, program_id, rfp_id, extraContext: context });

      // persist (as the user, RLS applies) unless the caller keeps its own history
      let convId = conversation_id || null; let persistError = null;
      if (body.persist !== false) {
        try {
          if (!convId) { const c = await who.db.insert('plm_ai_conversations', { org_id: who.orgId, program_id: program_id || null, user_id: who.userId, title: String(question).slice(0, 80) }); convId = c?.id || null; }
          if (convId) await who.db.insertMany('plm_ai_messages', [
            // Same columns as before v3: the Google database rejects extra ones.
            { conversation_id: convId, role: 'user', content: String(question) },
            { conversation_id: convId, role: 'assistant', content: run.text, tokens_in: run.usage.input_tokens, tokens_out: run.usage.output_tokens },
          ]);
        } catch (e) { console.error('[rd-advisor] persist failed:', e.message); persistError = e.message; }
      }
      return res.json({ success: true, response: run.text, conversation_id: convId, mode, model: run.model, usage: run.usage, duration_ms: Date.now() - started, created_items: run.created, sources: run.sources, persist_error: persistError || undefined });
    } catch (e) {
      console.error('[rd-advisor]', e?.status || '', e?.message);
      return res.json({ success: false, error: e?.message || String(e) });
    }
  });
};

module.exports._internal = { SUPPLIER_SCHEMA, REVIEW_SCHEMAS, supplierQuestion };
