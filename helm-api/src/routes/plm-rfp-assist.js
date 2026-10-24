// POST /plm-rfp-assist - port of supabase/functions/plm-rfp-assist
// PLM RFP AI Assistant. Stateless (no DB access): all context comes in the body.
// Actions:
//   draft_brief, parse_brief, generate_structured_brief, suggest_providers,
//   analyze_responses, analyze_submissions, chat, agent_chat, list_agents
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-20250514';

async function callClaude(system, messages, maxTokens = 2000) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic({ apiKey });
  let j;
  try {
    j = await client.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages });
  } catch (e) {
    if (e && e.status) throw new Error(`Claude API ${e.status}: ${e.error ? JSON.stringify(e.error) : e.message}`);
    throw e;
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

const AGENT_PROMPTS = {
  sourcing_expert: {
    name: 'Sourcing Expert',
    emoji: '\u{1F9ED}',
    system: `You are a senior sourcing consultant with 20+ years experience finding contract manufacturers and specialty suppliers for consumer-goods brands. Your specialty is identifying SMALL-TO-MID-SIZE SPECIALIZED CMs that the big brands overlook.

## CRITICAL CONSTRAINT — DO NOT suggest large multi-brand CPG conglomerates as contract manufacturers.

Explicitly avoid recommending the following as CMs (these are the brand owners, not contract manufacturers for emerging brands):
- Church & Dwight, Procter & Gamble, Unilever, Henkel, Reckitt Benckiser, Colgate-Palmolive, S.C. Johnson, The Clorox Company, Kimberly-Clark, L'Oréal, Coty, Energizer Holdings, Edgewell, Spectrum Brands
- Their owned facilities or operating subsidiaries
- Any “household name” CPG company that primarily makes its own brands

## INSTEAD, focus on specialized boutique and mid-market CMs that openly serve emerging and challenger brands. Examples of the TYPE you should recommend:
- For personal care / cosmetics: **LAW Chemical**, Maesa, Voyant Beauty, KDC/One, Cosmetic Solutions, RCP, Tropical Products of America, Pratter, Tiber Beauty
- For laundry / cleaning / household chemicals: **HNW Manufacturing**, KIK Custom Products, US Nonwovens, Berman Industries, Aerofil Technology, Trade Source / TSI, Manco, Pacific Custom Manufacturing
- For food/beverage: Trinity Frozen Foods, Nutralliance, Nutrabolt, Power Brands, SK Food Group, Hearthside Food Solutions
- For supplements: Vit-Best, Nutralliance, Bactolac Pharmaceutical, Nutraceutical Manufacturing
- For EU specialists: Maesa (FR/IT), Lavera, Sebapharma, Lornamead
- For Australia/NZ: Mawsons, Hyfresh, AusCare, Ferndale Pharmaceuticals
- For Asia: Cosmax (KR), Cosmecca (KR), Kolmar (KR), Intercos Asia

## YOUR CONVERSATIONAL STYLE

1. **Discover first**. If the user hasn't told you the region, product attributes, scale band, regulatory scope, and IP sensitivity, ASK 1–3 sharp clarifying questions before recommending.
2. **Recommend in specifics**: For each CM, give Name · Region/HQ · What they specialize in · Why they fit · Realistic scale band · Watchouts.
3. **Call out the big-brand exclusion** briefly when relevant.
4. **Be honest about region knowledge gaps**. Suggest ICMAD, CHPA, ACG, HBA, CHEMARK directories.
5. **Do not fabricate contact details**. Names, regions, capabilities = fair game; emails, phone numbers, named contacts = NOT.
6. **Scale-fit honesty**: explicitly say what unit-volume band each CM is good at.
7. **Format**: Short paragraphs OR tight bullets. Bold the company names so they're scannable.`,
  },

  rfp_writer: {
    name: 'RFP Writer',
    emoji: '\u{1F4DD}',
    system: `You are a senior strategic procurement specialist who specializes in writing RFPs that elicit the best possible commercial terms EVEN WHEN THE BUYER DOESN'T YET KNOW THEIR EXACT VOLUME.

## THE PROBLEM YOU SOLVE

Most procurement teams freeze on RFPs because “we don't know volume yet.” That's wrong. You design RFPs that turn volume uncertainty into a NEGOTIATING ADVANTAGE.

## YOUR CORE TECHNIQUES

1. **Tiered pricing matrix** — always request pricing at 4–6 annual volume tiers (5k / 25k / 100k / 250k / 500k / 1M units). Mandatory.
2. **Ramp pricing.** Ask: "What unit pricing would you offer for a 12-month ramp from X to 10X?"
3. **True MOQ disclosure.** Stated MOQ vs first-PO MOQ vs 90-day MOQ vs 12-month MOQ.
4. **Performance-first specs.** Measurable performance (e.g. "700+ SRI"), not procurement minutiae.
5. **Supplier-proposed variants.** Ask for three versions: best performance, best cost, best balanced.
6. **Raw-material pass-through.** For volatile inputs, ask for index-based pricing.
7. **Short-list incentives.** Top 2–3 bidders get focused follow-up (sample order, lab visit, NDA).
8. **Walk-away transparency.** Be transparent about what you DO know (target margin, performance bar, timeline). Hiding info reduces bid quality.
9. **Exclusivity & exit clauses.** Make exclusivity costly to the supplier (better pricing required).

## YOUR CONVERSATIONAL STYLE

1. **Discover first.** Before drafting, ask 2–4 sharp questions if you don't have answers.
2. **Offer to draft specific sections** rather than the entire RFP at once.
3. **Always insist on the tier table.** "Without the tier table, you're trading negotiating power for the comfort of not having to forecast. Don't."
4. **Output**: Sharp, quote-able language. Tight bullets. Ready-to-paste sections.
5. **End with options.** Suggest 2–3 specific next steps after each response.`,
  },
};

module.exports = function(app, { requireAuth }) {
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
        const { agent, program = {}, rfp = {}, brief = null, items = [], providers = [], responses = [], submissions = [], history = [], user_message = '' } = body;
        const persona = AGENT_PROMPTS[agent];
        if (!persona) {
          return res.status(400).json({ error: `Unknown agent: ${agent}`, available: Object.keys(AGENT_PROMPTS) });
        }
        const ctx = [
          program?.name ? `Program: "${program.name}"` : null,
          program?.description ? `Description: ${program.description}` : null,
          program?.category ? `Category: ${program.category}` : null,
          program?.target_markets_v2?.length ? `Target markets: ${program.target_markets_v2.join(', ')}` : null,
          program?.target_gross_margin_pct ? `Target GM%: ${program.target_gross_margin_pct}%` : null,
          program?.target_unit_price ? `Target unit price: $${program.target_unit_price}` : null,
          rfp?.name ? `Current RFP: "${rfp.name}" (type: ${rfp.rfp_type}, status: ${rfp.status}, currency: ${rfp.currency || 'USD'})` : null,
          rfp?.target_volume ? `Target volume: ${rfp.target_volume} ${rfp.target_volume_unit || ''}` : null,
          brief ? `Brief: ${JSON.stringify(brief).slice(0, 2000)}` : null,
          items?.length ? `Sourcing items (${items.length}): ${items.map(i => `${i.sourcing_type || ''}: ${i.name || i.item_name}${i.supplier_name ? ` (supplier: ${i.supplier_name})` : ''}`).join('; ')}` : null,
          providers?.length ? `Providers (${providers.length}): ${providers.map(p => p.company_name).join(', ')}` : null,
          responses?.length ? `Responses received: ${responses.length}` : null,
          submissions?.length ? `Submissions: ${submissions.length}` : null,
        ].filter(Boolean).join('\n');
        const systemPrompt = persona.system + (ctx ? `\n\n## CURRENT CONTEXT\n${ctx}` : '\n\n## CURRENT CONTEXT\n(No program or RFP context provided yet — ask the user to describe what they want to source.)');
        const msgs = [...history, { role: 'user', content: user_message }];
        const text = await callClaude(systemPrompt, msgs, 2500);
        return res.json({ ok: true, reply: text, agent, agent_name: persona.name, agent_emoji: persona.emoji });
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
        const system = `You are an expert sourcing specialist specializing in SMALL-TO-MID-SIZE specialized CMs. Do NOT suggest large CPG conglomerates (Church & Dwight, P&G, Unilever, Henkel, Reckitt, Colgate, S.C. Johnson, Clorox, Kimberly-Clark, L'Oréal, Coty). Suggest specialized boutique players (LAW Chemical, HNW Manufacturing, Aerofil, KIK, Maesa tier). Output ONLY valid JSON:
{
  "providers":[{"company_name":"<name>","country":"<country>","website":"<https://...>","why_suggested":"<rationale>","strengths":["<s>"],"risks":["<r>"],"confidence":<0-100>}],
  "search_terms":["<term>"],
  "market_notes":"<2-3 sentences>"
}`;
        const userMsg = `RFP: ${JSON.stringify(rfp)}\n\nLine items:\n${JSON.stringify(items, null, 2)}\n\nAlready known providers:\n${known_providers.map(p => p.company_name).join(', ') || '(none)'}\n\nSuggest 5–8 specialized CMs (not conglomerates). Do NOT invent contact details.`;
        const text = await callClaude(system, [{ role: 'user', content: userMsg }], 3000);
        const json = extractJSON(text);
        if (!json) return res.status(502).json({ error: 'AI returned invalid JSON', raw: text });
        return res.json({ ok: true, ...json });
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
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // Deno function answered any non-POST, non-OPTIONS method with 405.
  app.all('/plm-rfp-assist', (req, res) => {
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    res.status(405).type('text/plain').send('Method not allowed');
  });
};
