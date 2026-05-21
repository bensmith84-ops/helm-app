
// POST /plm-ai — port of supabase/functions/plm-ai
// PLM module's AI R&D advisor. Anthropic Claude with 5 tool definitions for creating
// formulations, ingredients, experiments. Iterates up to 8 turns for tool calling.
// Persists conversation history to plm_ai_conversations + plm_ai_messages tables.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6';
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

const VALID_EXP_TYPES = new Set(['formulation','process','stability','efficacy','safety','sensory','packaging','shelf_life','bioavailability','dissolution','compatibility','preservative_challenge','microbial','accelerated_aging','photostability','other']);
const VALID_STATUSES = new Set(['planning','in_progress','completed','analyzing','concluded','cancelled']);
const VALID_DOE = new Set(['full_factorial','fractional_factorial','plackett_burman','box_behnken','central_composite','taguchi','mixture_design','simplex_lattice','simplex_centroid','d_optimal','one_factor_at_a_time','screening','optimization','response_surface','custom','none']);

const TOOLS = [
  {
    name: 'create_formulation',
    description: 'Create a new formulation/formula in the PLM system under a program.',
    input_schema: {
      type: 'object',
      properties: {
        program_id: { type: 'string', description: 'The program UUID' },
        name: { type: 'string', description: 'Name of the formulation' },
        version: { type: 'string', description: "Version string e.g. 'v1.0'" },
        form_type: { type: 'string', description: 'e.g. tablet, sachet, sheet, liquid, powder' },
        target_batch_size: { type: 'number', description: 'Batch size in grams' },
        batch_size_unit: { type: 'string', description: 'e.g. g, kg, L' },
        lab_notes: { type: 'string' },
        manufacturing_process: { type: 'string' }
      },
      required: ['program_id', 'name']
    }
  },
  {
    name: 'add_formula_items',
    description: 'Add ingredient items to a formulation. Call once with all items as an array.',
    input_schema: {
      type: 'object',
      properties: {
        formulation_id: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ingredient_name: { type: 'string' },
              quantity: { type: 'number', description: '% w/w' },
              unit: { type: 'string', description: "Usually '%'" },
              function_in_formula: { type: 'string' },
              phase: { type: 'string' },
              notes: { type: 'string', description: 'Supplier, grade, lot' },
              sort_order: { type: 'number' }
            },
            required: ['ingredient_name', 'quantity']
          }
        }
      },
      required: ['formulation_id', 'items']
    }
  },
  {
    name: 'create_experiment',
    description: 'Create a trial/experiment. Call ONCE PER experiment. If 3 trials needed, call 3 times.',
    input_schema: {
      type: 'object',
      properties: {
        program_id: { type: 'string' },
        formulation_id: { type: 'string', description: 'Optional formulation UUID to link' },
        name: { type: 'string' },
        description: { type: 'string' },
        hypothesis: { type: 'string' },
        experiment_type: { type: 'string', description: 'Default: formulation' },
        doe_design: { type: 'string', description: 'Default: none' },
        status: { type: 'string', description: 'Default: planning' },
        factors: { type: 'object', description: 'JSON of experimental factors' },
        responses: { type: 'object', description: 'JSON of response variables' },
        planned_start: { type: 'string', description: 'ISO date' },
        planned_end: { type: 'string', description: 'ISO date' }
      },
      required: ['program_id', 'name']
    }
  },
  {
    name: 'list_formulations',
    description: 'List existing formulations for a program.',
    input_schema: { type: 'object', properties: { program_id: { type: 'string' } }, required: ['program_id'] }
  },
  {
    name: 'list_formula_items',
    description: 'List ingredients in a formulation.',
    input_schema: { type: 'object', properties: { formulation_id: { type: 'string' } }, required: ['formulation_id'] }
  }
];

const SYS_PROMPT = `You are Earth Breeze's full-stack R&D team — a panel of world-class experts who collaborate to give the best possible answer. Your team includes:

• Chief Formulation Scientist — detergent/HPC formulation, raw materials, process chemistry
• Manufacturing Engineer — tablet pressing, sheet forming, sachet filling, scale-up, troubleshooting
• Ingredient Sourcing Specialist — global supplier networks, trade names, pricing, MOQs, certifications
• Contract Manufacturing Scout — CMOs/CDMOs worldwide, capabilities, capacities, lead times
• DOE Statistician — experiment design, factorial designs, response surface methods, analysis
• Regulatory & Claims Specialist — EPA, TGA, EU Detergent Reg, AISE, ingredient compliance
• Private Label / White Label Strategist — fastest path to market, turnkey vs custom

You answer ANY R&D question. You do NOT refuse or redirect. You do NOT say "that falls outside my scope." If asked to source manufacturers, you provide specific company names, locations, capabilities, and contact approaches. If asked to source ingredients, you give trade names, suppliers, $/kg estimates, and MOQs. If asked to formulate, you give full quantitative formulations. If asked about manufacturing problems, you troubleshoot with specific root causes and fixes.

You also have DATABASE TOOLS to create formulations, add ingredients, and set up experiments directly in the Helm PLM system. When the user asks you to create/add/set up anything in the system, call the tools — don't just describe what you would do.

TOOL RULES:
1. When asked to create data, CALL THE TOOLS. Never just describe.
2. TOOLS FIRST, then brief summary.
3. For multiple trials, call create_experiment ONCE PER trial.
4. Keep text SHORT after tools execute.

DATABASE CONSTRAINTS (follow exactly):
- experiment_type: formulation, process, stability, efficacy, safety, sensory, packaging, shelf_life, dissolution, compatibility, other
- status: planning, in_progress, completed, analyzing, concluded, cancelled
- doe_design: full_factorial, fractional_factorial, screening, optimization, response_surface, custom, none

DETERGENT KNOWLEDGE BASE:
PVA/PVOH sheets: DH 85-90%, MW 30-50k, film 8-15% w/w, dry 50-65C. Surfactants: LAS 10-15%, AOS, SLES, SCI (sodium cocoyl isethionate for mild/premium). Builders: sodium citrate 15-25%, GLDA. Enzymes: protease (protein stains), amylase (starch), lipase (grease), cellulase (pilling), mannanase (guar gum). Bleach: sodium percarbonate + TAED activator. Tablet pressing: 15-25 kN compression, hardness 8-15 kP, friability <1%, disintegration <5 min. Sheet/film: cast or extrude PVA film, load actives, dry, cut.

Be direct, specific, and quantitative. Give actual numbers, not ranges where possible. Name real companies, real trade names, real suppliers.`;

module.exports = function(app, { requireAuth, pool }) {
  app.post('/plm-ai', requireAuth, async (req, res) => {
    try {
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.json({ success: false, error: 'ANTHROPIC_API_KEY not set' });

      // Get user's Helm UUID + org from their Firebase UID via the auth shim
      const fbSub = req.firebase?.sub;
      let userId = null;
      let orgId = DEFAULT_ORG_ID;
      if (fbSub) {
        const { rows } = await pool.query(
          `SELECT id, org_id FROM profiles WHERE firebase_uid = $1 LIMIT 1`,
          [fbSub]
        );
        if (rows[0]) { userId = rows[0].id; if (rows[0].org_id) orgId = rows[0].org_id; }
      }

      const { question, conversation_id, program_id, history } = req.body || {};
      if (!question?.trim()) return res.json({ success: false, error: 'Question is required' });

      const messages = [];
      if (history?.length > 0) {
        for (const m of history.slice(-20)) messages.push({ role: m.role, content: m.content });
      } else if (conversation_id) {
        const { rows: dm } = await pool.query(
          `SELECT role, content FROM plm_ai_messages WHERE conversation_id = $1 ORDER BY created_at LIMIT 20`,
          [conversation_id]
        );
        for (const m of dm) messages.push({ role: m.role, content: m.content });
      }

      // Build program context
      let ctx = '';
      if (program_id) {
        const { rows: progRows } = await pool.query(
          `SELECT id, name, program_type, current_stage FROM plm_programs WHERE id = $1 LIMIT 1`,
          [program_id]
        );
        if (progRows[0]) {
          const prog = progRows[0];
          ctx = `\nACTIVE PROGRAM: "${prog.name}" (ID: ${prog.id}) Type: ${prog.program_type} Stage: ${prog.current_stage}`;
          const { rows: fRows } = await pool.query(
            `SELECT id, name, version, status FROM plm_formulations WHERE program_id = $1 LIMIT 10`,
            [program_id]
          );
          if (fRows.length) ctx += `\nFormulations: ${fRows.map(x => `"${x.name}" (id:${x.id}, ${x.version})`).join('; ')}`;
          const { rows: eRows } = await pool.query(
            `SELECT id, name, status FROM plm_experiments WHERE program_id = $1 LIMIT 10`,
            [program_id]
          );
          if (eRows.length) ctx += `\nExperiments: ${eRows.map(x => `"${x.name}" (id:${x.id}, ${x.status})`).join('; ')}`;
        }
      }
      const { rows: apRows } = await pool.query(
        `SELECT id, name, category, current_stage FROM plm_programs WHERE deleted_at IS NULL LIMIT 20`
      );
      if (apRows.length) ctx += `\nALL PROGRAMS: ${apRows.map(p => `"${p.name}" (id:${p.id})`).join('; ')}`;

      messages.push({ role: 'user', content: ctx + `\n\n${question}` });

      // Tool execution function
      async function executeTool(name, input) {
        console.log(`[plm-ai] Tool: ${name}`, JSON.stringify(input).slice(0, 300));
        try {
          if (name === 'create_formulation') {
            const { rows } = await pool.query(
              `INSERT INTO plm_formulations (program_id, name, version, status, form_type, target_batch_size, batch_size_unit, lab_notes, manufacturing_process, created_by)
               VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9) RETURNING id, name`,
              [input.program_id, input.name, input.version || 'v1.0', input.form_type || null,
               input.target_batch_size || null, input.batch_size_unit || 'g',
               input.lab_notes || null, input.manufacturing_process || null, userId]
            );
            return JSON.stringify({ success: true, formulation_id: rows[0].id, name: rows[0].name });
          }
          if (name === 'add_formula_items') {
            const items = input.items || [];
            const added = [];
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              const { rows } = await pool.query(
                `INSERT INTO plm_formula_items (formulation_id, ingredient_name, quantity, unit, function_in_formula, phase, notes, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [input.formulation_id, it.ingredient_name, it.quantity, it.unit || '%',
                 it.function_in_formula || null, it.phase || null, it.notes || null, it.sort_order ?? i]
              );
              added.push(rows[0].id);
            }
            return JSON.stringify({ success: true, items_added: added.length });
          }
          if (name === 'create_experiment') {
            let expType = input.experiment_type || 'formulation';
            if (!VALID_EXP_TYPES.has(expType)) expType = 'formulation';
            let status = input.status || 'planning';
            if (!VALID_STATUSES.has(status)) {
              const sMap = { planned: 'planning', draft: 'planning', active: 'in_progress', done: 'completed', complete: 'completed' };
              status = sMap[status.toLowerCase()] || 'planning';
            }
            let doe = input.doe_design || null;
            if (doe && !VALID_DOE.has(doe)) doe = 'custom';
            const { rows } = await pool.query(
              `INSERT INTO plm_experiments (program_id, formulation_id, name, description, hypothesis, experiment_type, doe_design, status, factors, responses, planned_start, planned_end, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, name`,
              [input.program_id, input.formulation_id || null, input.name, input.description || null,
               input.hypothesis || null, expType, doe, status,
               input.factors || null, input.responses || null,
               input.planned_start || null, input.planned_end || null, userId]
            );
            return JSON.stringify({ success: true, experiment_id: rows[0].id, name: rows[0].name });
          }
          if (name === 'list_formulations') {
            const { rows } = await pool.query(
              `SELECT id, name, version, status, form_type FROM plm_formulations WHERE program_id = $1`,
              [input.program_id]
            );
            return JSON.stringify({ formulations: rows });
          }
          if (name === 'list_formula_items') {
            const { rows } = await pool.query(
              `SELECT * FROM plm_formula_items WHERE formulation_id = $1 ORDER BY sort_order`,
              [input.formulation_id]
            );
            return JSON.stringify({ items: rows });
          }
          return JSON.stringify({ error: `Unknown tool: ${name}` });
        } catch (e) {
          return JSON.stringify({ error: e.message });
        }
      }

      // Tool calling loop (max 8 iterations)
      const client = new Anthropic({ apiKey });
      let finalResponse = '';
      let totalIn = 0, totalOut = 0;
      const toolActions = [];
      let cur = [...messages];
      const MAX = 8;

      for (let r = 0; r < MAX; r++) {
        const result = await client.messages.create({
          model: MODEL, max_tokens: 4096, system: SYS_PROMPT,
          messages: cur, tools: TOOLS,
        });
        totalIn += result.usage?.input_tokens || 0;
        totalOut += result.usage?.output_tokens || 0;

        const txt = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        const tools = (result.content || []).filter(b => b.type === 'tool_use');

        if (tools.length > 0 && result.stop_reason === 'tool_use') {
          cur.push({ role: 'assistant', content: result.content });
          const trs = [];
          for (const tb of tools) {
            const tr = await executeTool(tb.name, tb.input);
            toolActions.push(`${tb.name}: ${tr.slice(0, 200)}`);
            trs.push({ type: 'tool_result', tool_use_id: tb.id, content: tr });
          }
          cur.push({ role: 'user', content: trs });
          continue;
        }

        finalResponse = txt;

        // Nudge: did the user ask for experiments but Claude didn't create any?
        const wantsExp = /trial|experiment|DOE/i.test(question);
        const madeExp = toolActions.some(a => a.startsWith('create_experiment') && a.includes('success'));
        if (wantsExp && !madeExp && /experiment|trial/i.test(txt) && r < MAX - 1) {
          cur.push({ role: 'assistant', content: result.content });
          cur.push({ role: 'user', content: "You described experiments but didn't create them. Call create_experiment now for each one." });
          finalResponse = '';
          continue;
        }
        break;
      }

      if (!finalResponse.trim() && toolActions.length > 0) {
        finalResponse = `Done! Created ${toolActions.length} items:\n${toolActions.map(a => '• ' + a.split(':')[0].replace(/_/g, ' ')).join('\n')}`;
      }

      // Persist conversation
      let convId = conversation_id;
      if (!convId && userId) {
        const { rows: c } = await pool.query(
          `INSERT INTO plm_ai_conversations (org_id, program_id, user_id, title)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [orgId, program_id || null, userId, question.slice(0, 80)]
        );
        if (c[0]) convId = c[0].id;
      }
      if (convId) {
        await pool.query(
          `INSERT INTO plm_ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
          [convId, question]
        );
        const saved = toolActions.length > 0
          ? `[Tools: ${toolActions.map(a => a.split(':')[0]).join(', ')}]\n\n${finalResponse}`
          : finalResponse;
        await pool.query(
          `INSERT INTO plm_ai_messages (conversation_id, role, content, tokens_in, tokens_out)
           VALUES ($1, 'assistant', $2, $3, $4)`,
          [convId, saved, totalIn, totalOut]
        );
      }

      return res.json({
        success: true,
        response: finalResponse,
        conversation_id: convId,
        mode: 'unified',
        tool_actions: toolActions,
        usage: { input_tokens: totalIn, output_tokens: totalOut },
      });
    } catch (err) {
      console.error('[plm-ai]', err?.message);
      return res.json({ success: false, error: err?.message || String(err) });
    }
  });
};
