// POST /plm-rfp-assist - port of supabase/functions/plm-rfp-assist
// PLM RFP AI Assistant. Stateless (no DB access): all context comes in the body.
// Mostly stateless (context comes in the body). agent_chat and suggest_providers run on
// the shared R&D Advisor engine, which reads Helm data as the user and researches the web.
// Actions:
//   draft_brief, parse_brief, generate_structured_brief, suggest_providers,
//   analyze_responses, analyze_submissions, chat, agent_chat, list_agents
const Anthropic = require('@anthropic-ai/sdk');
const { runAdvisor, resolveUserDb, makeClient, verifiedLink } = require('../lib/advisor/engine');

// Newest first; falls back if a model id isn't available to this API key.
const MODELS = (process.env.RFP_ASSIST_MODELS || 'claude-sonnet-5-5,claude-sonnet-4-6,claude-sonnet-4-20250514').split(',').map((x) => x.trim()).filter(Boolean);

async function callClaude(system, messages, maxTokens = 2000) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic({ apiKey });
  let j;
  for (let i = 0; i < MODELS.length; i++) {
    try {
      j = await client.messages.create({ model: MODELS[i], max_tokens: maxTokens, system, messages });
      break;
    } catch (e) {
      const notFound = e?.status === 404 || (/model/i.test(e?.message || '') && /not.?found|invalid|does not exist/i.test(e?.message || ''));
      if (notFound && i < MODELS.length - 1) continue;
      if (e && e.status) throw new Error(`Claude API ${e.status}: ${e.error ? JSON.stringify(e.error) : e.message}`);
      throw e;
    }
  }
  return (j.content || []).map(b => b.text || '').join('') || '';
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const obj = text.match(/\{[\s\S]+\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch {} }
  return null;
}

// Structured brief schema description — reused by parse_brief + generate_structured_brief
const BRIEF_SCHEMA = `{
  "project_name":"string",
  "point_of_contact":{"name":"string","email":"string"},
  "scope":"string (full scope description)",
  "background":"string (full background/why text)",
  "product":"string (product type, e.g. Powder Laundry Detergent)",
  "launch_date":"string",
  "countries_of_sale":["US","CA"],
  "future_countries":["UK","AU"],
  "distribution_channels":["Ecommerce","Retail"],
  "brand_claims":["No Optical Brighteners","No 1,4 dioxane","No dyes"],
  "additional_claims":["HE compatible","Septic safe"],
  "efficacy_standards":{
    "ideal":"string (e.g. 700+ SRI)",
    "minimum":"string (e.g. 560 SRI)",
    "must_have":["Protease, Amylase, Lipase enzymes","Anti-greying"]
  },
  "dosages":"string",
  "raw_materials_want":["item","item"],
  "raw_materials_must":["item"],
  "certifications_must":["Leaping Bunny"],
  "certifications_want":["USDA Biobased"],
  "packaging_preferences":["paperboard","PCR","Kraft+PLA+Foil"],
  "packaging_certifications":["Industrial Compostable","PCR > 90%"],
  "regulatory_considerations":["TSCA & EU Reach","FTC Made in USA rules"],
  "fragrance_requirements":["IFRA Conformity","CA SB 258 Disclosure"]
}`;

// The two chat agents now run on the shared R&D Advisor engine (web-verified
// research, Earth Breeze data, the chemist knowledge base). Kept here so the
// screens' agent keys keep working.
const AGENT_PROMPTS = {
  sourcing_expert: { name: 'Sourcing Expert', emoji: '\u{1F9ED}', mode: 'sourcing' },
  rfp_writer: { name: 'RFP Writer', emoji: '\u{1F4DD}', mode: 'rfp' },
};

const PROVIDER_SCHEMA = { type: 'object', properties: {
  providers: { type: 'array', items: { type: 'object', properties: { company_name: { type: 'string' }, country: { type: 'string' }, website: { type: 'string' }, source_url: { type: 'string', description: 'Page from this conversation that verifies the company and what it makes' }, why_suggested: { type: 'string' }, strengths: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number', description: '0-100 fit' } }, required: ['company_name', 'source_url', 'why_suggested', 'confidence'] } },
  search_terms: { type: 'array', items: { type: 'string' } },
  market_notes: { type: 'string' },
}, required: ['providers'] };

function screenContext({ program = {}, rfp = {}, brief = null, items = [], providers = [], responses = [], submissions = [] }) {
  return [
    program?.name ? `Program: "${program.name}"` : null,
    program?.description ? `Description: ${program.description}` : null,
    program?.category ? `Category: ${program.category}` : null,
    program?.target_markets_v2?.length ? `Target markets: ${program.target_markets_v2.join(', ')}` : null,
    program?.target_gross_margin_pct ? `Target GM%: ${program.target_gross_margin_pct}%` : null,
    program?.target_unit_price ? `Target unit price: $${program.target_unit_price}` : null,
    rfp?.name ? `Current RFP: "${rfp.name}" (type: ${rfp.rfp_type}, status: ${rfp.status}, currency: ${rfp.currency || 'USD'})` : null,
    rfp?.target_volume ? `Target volume: ${rfp.target_volume} ${rfp.target_volume_unit || ''}` : null,
    brief ? `Brief: ${JSON.stringify(brief).slice(0, 2000)}` : null,
    items?.length ? `Sourcing items (${items.length}): ${items.map((i) => `${i.sourcing_type || ''}: ${i.name || i.item_name}${i.supplier_name ? ` (supplier: ${i.supplier_name})` : ''}${i.specification ? ` [spec: ${String(i.specification).slice(0, 200)}]` : ''}`).join('; ')}` : null,
    providers?.length ? `Providers (${providers.length}): ${providers.map((p) => p.company_name).join(', ')}` : null,
    responses?.length ? `Line-item responses received: ${responses.length}` : null,
    submissions?.length ? `Submissions: ${submissions.length}` : null,
  ].filter(Boolean).join('\n');
}

module.exports = function(app, { requireAuth, pool, verifyFirebase, anthropicFactory, fetchImpl = fetch } = {}) {
  const verifyFb = verifyFirebase || ((t) => require('firebase-admin').auth().verifyIdToken(t));
  const engine = async (req) => { const who = await resolveUserDb(req, { pool, verifyFirebase: verifyFb, fetchImpl }); if (who.error) { const e = new Error(who.error[1]); e.http = who.error[0]; throw e; } return { client: makeClient(anthropicFactory), db: who.db, userId: who.userId, orgId: who.orgId }; };
  app.post('/plm-rfp-assist', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const action = body?.action;

      // ── PARSE BRIEF (from pasted text/PDF extraction) ──
      if (action === 'parse_brief') {
        const { text = '' } = body;
        if (!text || text.length < 50) {
          return res.status(400).json({ error: 'text is required (min 50 chars)' });
        }
        const system = `Extract a structured product development brief from the user's text. Output ONLY valid JSON matching this schema (omit any field whose information isn't in the source text rather than inventing it):

${BRIEF_SCHEMA}

Guidance:
- Use ISO-2 country codes (US, CA, UK, AU) for countries_of_sale and future_countries
- For brand_claims, extract negative claims like "No Optical Brighteners", "No 1,4 dioxane"
- For additional_claims, extract positive claims like "Hypoallergenic", "HE compatible"
- For efficacy_standards.must_have, include required ingredients/properties as discrete items
- For raw_materials_must vs raw_materials_want, distinguish hard requirements from preferences
- Preserve verbatim language where reasonable; do not paraphrase regulatory language
- Output ONLY the JSON object, no prose, no markdown fences`;
        const reply = await callClaude(system, [{ role: 'user', content: `Parse this product development brief into structured JSON:\n\n${text}` }], 3500);
        const json = extractJSON(reply);
        if (!json) return res.status(502).json({ error: 'AI returned invalid JSON', raw: reply });
        return res.json({ ok: true, brief: json });
      }

      // ── GENERATE STRUCTURED BRIEF (from program context) ──
      if (action === 'generate_structured_brief') {
        const { program = {}, rfp = {}, items = [], extra_context = '' } = body;
        const system = `You are an expert product/sourcing manager. Generate a comprehensive structured product development brief from the program context. Output ONLY valid JSON matching this schema:

${BRIEF_SCHEMA}

Guidance:
- Fill every field with realistic, specific content; do not leave fields blank or vague
- For brand_claims and additional_claims, infer from the program's category and known consumer expectations
- For efficacy_standards, propose industry-standard benchmarks for the product category (e.g. SRI scores for laundry, foam height for shampoos)
- Be specific in regulatory_considerations (cite real regulations like TSCA, EU REACH, CA SB 258, FTC Made in USA)
- Output ONLY the JSON object, no prose, no markdown`;
        const userMsg = `Program: ${JSON.stringify(program)}\n\nRFP context: ${JSON.stringify({ name: rfp.name, rfp_type: rfp.rfp_type, target_volume: rfp.target_volume, currency: rfp.currency })}\n\nLine items: ${JSON.stringify(items)}\n\nExtra context: ${extra_context || '(none)'}\n\nGenerate the brief.`;
        const reply = await callClaude(system, [{ role: 'user', content: userMsg }], 3500);
        const json = extractJSON(reply);
        if (!json) return res.status(502).json({ error: 'AI returned invalid JSON', raw: reply });
        return res.json({ ok: true, brief: json });
      }

      // ── ANALYZE SUBMISSIONS (richer than analyze_responses; uses plm_rfp_submissions) ──
      if (action === 'analyze_submissions') {
        const { rfp = {}, brief = {}, submissions = [], providers = [] } = body;
        const system = `You are an analytical procurement specialist. Score and rank provider submissions to an RFP. Each submission may include formulation details, pricing tiers, test results, certifications, and attachments.

Output ONLY valid JSON:
{
  "rankings":[
    {
      "submission_id":"<uuid>",
      "rfp_provider_id":"<uuid>",
      "company_name":"<name>",
      "submission_name":"<e.g. Best Performance>",
      "score":<0-100>,
      "breakdown":{"price":<0-100>,"performance":<0-100>,"compliance":<0-100>,"lead_time":<0-100>,"completeness":<0-100>},
      "meets_must_haves":<bool>,
      "must_have_gaps":["<gap>"],
      "strengths":["<strength>"],
      "concerns":["<concern>"],
      "recommendation":"<shortlist|request_clarification|reject|negotiate>"
    }
  ],
  "summary":"<2-3 sentence executive summary: cheapest at MOQ, cheapest at max break, fastest, best balanced>",
  "recommended_award":"<submission_id of recommended winner, or null>",
  "clarifications_needed":["<question>"],
  "price_curve_insights":"<2-3 sentences on the volume→price curve and where the steepest discounts kick in>"
}

When scoring:
- price: lower is better, but weigh max_break_unit_price more than base for high-volume programs
- performance: how well test_results meet brief's efficacy_standards (ideal vs minimum)
- compliance: must-have certs/regulatory requirements met (Leaping Bunny, no China sourcing, etc.)
- lead_time: shorter is better
- completeness: ingredients disclosed, certifications uploaded, test results included`;
        const userMsg = `RFP: ${JSON.stringify({ name: rfp.name, rfp_type: rfp.rfp_type, target_volume: rfp.target_volume, target_unit_price: rfp.target_unit_price, currency: rfp.currency })}\n\nBrief (the must-have/want requirements):\n${JSON.stringify(brief)}\n\nProviders:\n${JSON.stringify(providers.map(p => ({ id: p.id, company_name: p.company_name })))}\n\nSubmissions:\n${JSON.stringify(submissions)}\n\nScore and rank.`;
        const reply = await callClaude(system, [{ role: 'user', content: userMsg }], 4000);
        const json = extractJSON(reply);
        if (!json) return res.status(502).json({ error: 'AI returned invalid JSON', raw: reply });
        return res.json({ ok: true, ...json });
      }

      // ── AGENT CHAT ──
      if (action === 'agent_chat') {
        const { agent, program = {}, rfp = {}, history = [], user_message = '' } = body;
        const persona = AGENT_PROMPTS[agent];
        if (!persona) return res.status(400).json({ error: `Unknown agent: ${agent}`, available: Object.keys(AGENT_PROMPTS) });
        const base = await engine(req);
        const run = await runAdvisor({ ...base, mode: persona.mode, question: user_message, history, program_id: body.program_id || program?.id || null, rfp_id: body.rfp_id || rfp?.id || null, extraContext: screenContext(body) });
        return res.json({ ok: true, reply: run.text, agent, agent_name: persona.name, agent_emoji: persona.emoji, sources: run.sources, created_items: run.created, model: run.model });
      }

      // ── DRAFT BRIEF (legacy short-form) ──
      if (action === 'draft_brief') {
        const { program = {}, sourcing_item = {}, rfp_type, target_volume, target_volume_unit, currency = 'USD' } = body;
        const system = `You are an expert sourcing & procurement specialist for a consumer-goods brand. Output ONLY valid JSON (no prose, no markdown fences):
{
  "name":"<short RFP title>",
  "description":"<2-4 sentence overview>",
  "specification":"<detailed spec>",
  "evaluation_criteria":[{"key":"price","label":"Price","weight":35,"type":"numeric"}, ...],
  "required_certifications":["<cert1>"],
  "suggested_due_date_days":<int>,
  "market_context":"<2-3 sentences>",
  "questions_for_providers":["<question>"]
}`;
        const userMsg = `Program: ${JSON.stringify(program)}\n\nSourcing item: ${JSON.stringify(sourcing_item)}\n\nRFP type: ${rfp_type}\nTarget volume: ${target_volume ?? 'unspecified'} ${target_volume_unit ?? ''}\nCurrency: ${currency}\n\nDraft a comprehensive RFP brief. Weights sum to 100.`;
        const text = await callClaude(system, [{ role: 'user', content: userMsg }], 2500);
        const json = extractJSON(text);
        if (!json) return res.status(502).json({ error: 'AI returned invalid JSON', raw: text });
        return res.json({ ok: true, brief: json });
      }

      // ── SUGGEST PROVIDERS ──
      if (action === 'suggest_providers') {
        const { rfp = {}, items = [], known_providers = [] } = body;
        const base = await engine(req);
        const q = `Suggest 4-8 specialist contract manufacturers or suppliers for this RFP.\nRFP: ${JSON.stringify(rfp)}\nLine items: ${JSON.stringify(items).slice(0, 4000)}\nAlready known (don't repeat): ${known_providers.map((p) => p.company_name).join(', ') || '(none)'}`;
        const run = await runAdvisor({ ...base, mode: 'sourcing', task: 'suggest_providers', question: q, program_id: body.program_id || null, rfp_id: body.rfp_id || rfp?.id || null, resultSchema: PROVIDER_SCHEMA, allowWrites: false });
        const providers = []; let dropped = 0;
        for (const p of run.result?.providers || []) {
          const src = verifiedLink(p.source_url, run) || verifiedLink(p.website, run);
          if (!src) { dropped++; continue; }
          providers.push({ ...p, website: verifiedLink(p.website, run) || src, source_url: src, confidence: Math.round(Number(p.confidence) || 0) });
        }
        return res.json({ ok: true, providers, search_terms: run.result?.search_terms || [], market_notes: run.result?.market_notes || '', dropped_unverified: dropped, sources: run.sources });
      }

      // ── ANALYZE RESPONSES (line-item matrix) ──
      if (action === 'analyze_responses') {
        const { rfp = {}, items = [], providers = [], responses = [] } = body;
        const system = `You are an analytical procurement specialist. Output ONLY valid JSON:
{
  "rankings":[{"rfp_provider_id":"<uuid>","company_name":"<name>","score":<0-100>,"breakdown":{"price":<0-100>,"lead_time":<0-100>,"moq":<0-100>,"certifications":<0-100>,"completeness":<0-100>},"strengths":["<s>"],"concerns":["<c>"],"recommendation":"<shortlist|request_clarification|reject|negotiate>"}],
  "summary":"<2-3 sentences>",
  "recommended_award":"<rfp_provider_id or null>",
  "clarifications_needed":["<q>"]
}`;
        const userMsg = `RFP: ${JSON.stringify({ name: rfp.name, type: rfp.rfp_type, criteria: rfp.evaluation_criteria, target_volume: rfp.target_volume, currency: rfp.currency })}\n\nItems:\n${JSON.stringify(items, null, 2)}\n\nProviders:\n${JSON.stringify(providers.map(p => ({ id: p.id, company_name: p.company_name })))}\n\nResponses:\n${JSON.stringify(responses, null, 2)}`;
        const text = await callClaude(system, [{ role: 'user', content: userMsg }], 3500);
        const json = extractJSON(text);
        if (!json) return res.status(502).json({ error: 'AI returned invalid JSON', raw: text });
        return res.json({ ok: true, ...json });
      }

      // ── BASIC CHAT (legacy) ──
      if (action === 'chat') {
        const { rfp = {}, items = [], providers = [], responses = [], history = [], user_message = '' } = body;
        const system = `You are an expert sourcing & procurement advisor. Concise, specific, practical. RFP context: ${JSON.stringify({ name: rfp.name, type: rfp.rfp_type, status: rfp.status, item_count: items.length, provider_count: providers.length, response_count: responses.length })}`;
        const msgs = [...history, { role: 'user', content: user_message }];
        const text = await callClaude(system, msgs, 1500);
        return res.json({ ok: true, reply: text });
      }

      // ── LIST AGENTS ──
      if (action === 'list_agents') {
        return res.json({
          ok: true,
          agents: Object.entries(AGENT_PROMPTS).map(([k, v]) => ({ key: k, name: v.name, emoji: v.emoji })),
        });
      }

      return res.status(400).json({ error: 'unknown action' });
    } catch (e) {
      console.error('plm-rfp-assist error', e);
      return res.status(e?.http || 500).json({ error: e?.message || String(e) });
    }
  });

  // Deno function answered any non-POST, non-OPTIONS method with 405.
  app.all('/plm-rfp-assist', (req, res) => {
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    res.status(405).type('text/plain').send('Method not allowed');
  });
};
