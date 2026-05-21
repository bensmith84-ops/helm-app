
// POST /plm-advisor — port of supabase/functions/plm-advisor
// Three advisor types for PLM programs: claims_review, gm_advisor, stage_readiness.
// Gathers program context from 6 tables, calls Anthropic with specialized prompt.
const Anthropic = require('@anthropic-ai/sdk');

module.exports = function(app, { pool }) {
  app.post('/plm-advisor', async (req, res) => {
    try {
      const { program_id, advisor_type } = req.body || {};
      if (!program_id) return res.status(400).json({ error: 'program_id required' });

      // Gather all context in parallel
      const [progR, formR, sourcingR, claimsR, issuesR, testR] = await Promise.all([
        pool.query(`SELECT * FROM plm_programs WHERE id = $1 LIMIT 1`, [program_id]),
        pool.query(`SELECT f.*, COALESCE(
          (SELECT json_agg(json_build_object(
            'ingredient_name', i.ingredient_name,
            'quantity', i.quantity,
            'unit', i.unit,
            'item_type', i.item_type,
            'function_in_formula', i.function_in_formula
          )) FROM plm_formula_items i WHERE i.formulation_id = f.id),
          '[]'::json
        ) AS plm_formula_items FROM plm_formulations f WHERE f.program_id = $1`, [program_id]),
        pool.query(`SELECT * FROM plm_sourcing WHERE program_id = $1`, [program_id]),
        pool.query(`SELECT * FROM plm_claim_documents WHERE program_id = $1`, [program_id]),
        pool.query(`SELECT * FROM plm_issues WHERE program_id = $1 AND status = 'open'`, [program_id]),
        pool.query(`SELECT * FROM plm_test_results WHERE program_id = $1`, [program_id]),
      ]);

      const program = progR.rows[0];
      if (!program) return res.status(404).json({ error: 'program not found' });

      const formulas = formR.rows;
      const sourcing = sourcingR.rows;
      const claimDocs = claimsR.rows;
      const issues = issuesR.rows;
      const testResults = testR.rows;

      const ingredients = formulas.flatMap(f => (f.plm_formula_items || []).map(i => ({
        name: i.ingredient_name, pct: i.quantity, unit: i.unit, type: i.item_type, function: i.function_in_formula,
      })));

      const ctx = {
        program: {
          name: program.name, type: program.program_type, stage: program.current_stage, brand: program.brand,
          markets: program.target_markets_v2, channels: program.channels_v2, gmTarget: program.target_gross_margin_pct,
        },
        desiredClaims: program.desired_claims || [],
        ingredients,
        sourcing: sourcing.map(s => ({ name: s.name, type: s.sourcing_type, supplier: s.supplier_name, uom: s.moq_unit })),
        substantiationDocs: claimDocs.map(d => ({ title: d.title, type: d.doc_type, claimRefs: d.claim_refs })),
        openIssues: issues.length,
        testResults: testResults.map(t => ({ test: t.test_name, status: t.status, category: t.test_category })),
      };

      const prompts = {
        claims_review: `You are a regulatory and product claims expert reviewing a product program called "${ctx.program.name}" for brand ${ctx.program.brand || 'unknown'}.

Desired claims:
${ctx.desiredClaims.map((c, i) => `${i + 1}. ${c}`).join('\n') || 'None specified'}

Formula ingredients:
${ctx.ingredients.map(i => `- ${i.name} (${i.pct}${i.unit}) - ${i.type} - ${i.function}`).join('\n') || 'No formula defined'}

Substantiation documents: ${ctx.substantiationDocs.length} documents
Test results: ${ctx.testResults.length} (${ctx.testResults.filter(t => t.status === 'pass').length} passing)
Target markets: ${(ctx.program.markets || []).join(', ') || 'Not specified'}

For each desired claim, assess: 1. Feasibility 2. Substantiation 3. Regulatory risk 4. Gaps 5. Recommendations.
Also flag any ingredients that may conflict with specific market regulations.

Respond in JSON:
{ "overall_assessment": "string", "claim_reviews": [{"claim_number": 1, "claim_text": "...", "feasibility": "high|medium|low", "evidence_strength": "strong|moderate|weak|none", "regulatory_risk": "high|medium|low", "gaps": ["..."], "recommendations": ["..."], "supporting_ingredients": ["..."]}], "ingredient_flags": [{"ingredient": "...", "concern": "...", "markets": ["US","EU"]}], "next_steps": ["..."], "confidence": "high|medium|low" }`,

        gm_advisor: `You are a financial advisor for a consumer product company. Analyze this product program's gross margin potential.

Program: ${ctx.program.name}
GM% Target: ${ctx.program.gmTarget || 'Not set'}%
Channels: ${(ctx.program.channels || []).join(', ')}
Markets: ${(ctx.program.markets || []).join(', ')}

Sourcing items: ${ctx.sourcing.length} items
Ingredients: ${ctx.ingredients.length} formula components
Open issues: ${ctx.openIssues}

Provide strategic recommendations for achieving the GM% target.

Respond in JSON:
{ "summary": "string", "gm_benchmark": {"low": 50, "typical": 65, "high": 75, "unit": "%"}, "recommendations": [{"title": "...", "impact": "high|medium|low", "detail": "..."}], "risks": [{"risk": "...", "severity": "high|medium|low"}], "volume_thresholds": [{"units": 10000, "note": "..."}], "channel_mix_advice": "string" }`,

        stage_readiness: `You are a product development expert assessing stage-gate readiness for "${ctx.program.name}" currently at stage: ${ctx.program.stage}.

Ingredients defined: ${ctx.ingredients.length}
Formulations: ${formulas.length}
Open issues: ${ctx.openIssues}
Test results: ${ctx.testResults.length} (${ctx.testResults.filter(t => t.status === 'pass').length} pass, ${ctx.testResults.filter(t => t.status === 'fail').length} fail)
Claims defined: ${ctx.desiredClaims.length}
Substantiation docs: ${ctx.substantiationDocs.length}
Sourcing items: ${ctx.sourcing.length}

Assess readiness to advance to the next stage.

Respond in JSON:
{ "current_stage": "string", "next_stage": "string", "readiness_score": 75, "summary": "string", "blockers": [{"item": "...", "severity": "critical|major|minor"}], "ready_items": ["..."], "checklist": [{"item": "...", "status": "complete|in_progress|not_started", "required": true}] }`,
      };

      const prompt = prompts[advisor_type] || prompts.claims_review;
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const client = new Anthropic({ apiKey });
      const aiData = await client.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = aiData.content?.[0]?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      let parsed;
      try { parsed = JSON.parse(clean); }
      catch { parsed = { error: 'Could not parse AI response', raw: text.slice(0, 500) }; }

      return res.json({ success: true, advisor_type, result: parsed });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
};
