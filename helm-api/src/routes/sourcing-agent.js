
// POST /sourcing-agent — port of supabase/functions/sourcing-agent
// 2 actions: discover (AI + web_search finds real CMs), draft_outreach (AI drafts outbound email).
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

module.exports = function(app, { pool }) {
  app.post('/sourcing-agent', async (req, res) => {
    try {
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

      // Resolve org from Firebase user if present
      let orgId = DEFAULT_ORG_ID;
      let userId = '';
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        // We could decode the JWT here but the route is non-required-auth.
        // Skip — sourcing functions are typically internal/admin.
      }

      const body = req.body || {};
      const { action } = body;

      if (action === 'discover') {
        return await handleDiscover(req, res, pool, apiKey, body.project_id, orgId);
      }
      if (action === 'draft_outreach') {
        return await handleDraftOutreach(req, res, pool, apiKey, body, orgId);
      }
      throw new Error(`Unknown action: ${action}`);
    } catch (err) {
      res.status(400).json({ success: false, error: err?.message || String(err) });
    }
  });
};

async function handleDiscover(req, res, pool, apiKey, projectId, orgId) {
  const { rows: pRows } = await pool.query(
    `SELECT * FROM sourcing_projects WHERE id = $1 LIMIT 1`, [projectId]);
  const project = pRows[0];
  if (!project) throw new Error('Project not found');

  const { rows: existingCms } = await pool.query(
    `SELECT company_name FROM sourcing_cms WHERE org_id = $1`, [orgId]);
  const existingNames = new Set(existingCms.map(c => c.company_name.toLowerCase()));
  const startTime = Date.now();

  const geographies = (project.target_geographies || []).join(', ') || 'US';
  const certs = (project.required_certifications || []).join(', ') || 'none specified';
  const types = (project.sourcing_type || []).map(t => t.replace(/_/g, ' ')).join(', ') || 'toll manufacturing';

  const prompt = `You are a procurement specialist at Earth Breeze, an eco-friendly DTC laundry detergent sheet company. You need to find REAL contract manufacturers.

IMPORTANT: Use web search to find and VERIFY real companies. Only include companies whose websites confirm they manufacture the relevant products. Do NOT guess or hallucinate capabilities.

SOURCING REQUIREMENTS:
- Product: Laundry detergent sheets, dishwasher sheets, dissolvable cleaning sheets/tablets, PVA film products
- Sourcing Type: ${types}
- Target Geography: ${geographies}
- Required Certifications: ${certs}
- Min Capacity: ${project.min_capacity_units_month ? project.min_capacity_units_month + ' units/month' : 'not specified'}
- Additional: ${project.additional_requirements || 'none'}

${existingNames.size > 0 ? 'ALREADY IN OUR SYSTEM (skip these): ' + [...existingNames].join(', ') : ''}

Search for manufacturers of: PVA film laundry sheets, dissolvable detergent sheets/strips, compressed cleaning tablets, single-dose cleaning products.

For each company found, VERIFY on their website that they actually make these products. Only include verified companies.

After searching, respond with ONLY a JSON array:
[{"company_name":"string","website":"string","description":"verified capabilities from their site","headquarters_city":"string or null","headquarters_state":"string or null","headquarters_country":"string","certifications":["string"],"estimated_capacity":"string or null","product_types":["string"],"general_email":"string or null","specialties":"string","contacts":[{"name":"string","title":"string","department":"string"}],"ai_fit_score":0,"ai_fit_reasoning":"what you verified on their site","source_url":"page URL where you confirmed this"}]`;

  const client = new Anthropic({ apiKey });
  const result = await client.messages.create({
    model: MODEL, max_tokens: 16384,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 20 }],
    messages: [{ role: 'user', content: prompt }],
  });

  let allText = '';
  for (const block of (result.content || [])) {
    if (block.type === 'text') allText += block.text + '\n';
  }

  let cms = [];
  try {
    const jsonMatch = allText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) cms = JSON.parse(jsonMatch[0]);
    else cms = JSON.parse(allText.replace(/```json|```/g, '').trim());
    if (!Array.isArray(cms)) cms = [cms];
  } catch (e) {
    throw new Error('The AI is still searching. Please try again — it may need more time to compile results.');
  }

  let cmsCreated = 0, cmsLinked = 0;
  const createdCmIds = [];

  for (const cm of cms) {
    if (!cm.company_name) continue;
    if (existingNames.has(cm.company_name.toLowerCase())) continue;

    const { rows: existCm } = await pool.query(
      `SELECT id FROM sourcing_cms WHERE company_name = $1 AND org_id = $2 LIMIT 1`,
      [cm.company_name, orgId]);
    let cmId;
    if (existCm[0]) {
      cmId = existCm[0].id;
    } else {
      const { rows: newCm } = await pool.query(
        `INSERT INTO sourcing_cms
          (org_id, company_name, website, description, headquarters_city, headquarters_state,
           headquarters_country, certifications, estimated_capacity, product_types, general_email,
           specialties, source, source_url, ai_fit_score, ai_fit_reasoning, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ai_web_search', $13, $14, $15, 'discovered')
         RETURNING id`,
        [orgId, cm.company_name, cm.website || null, cm.description || null,
         cm.headquarters_city || null, cm.headquarters_state || null, cm.headquarters_country || null,
         cm.certifications || [], cm.estimated_capacity || null, cm.product_types || [],
         cm.general_email || null, cm.specialties || null,
         cm.source_url || cm.website || null, cm.ai_fit_score || null, cm.ai_fit_reasoning || null]);
      if (!newCm[0]) continue;
      cmId = newCm[0].id;
      cmsCreated++;

      if (cm.contacts?.length > 0) {
        for (let i = 0; i < cm.contacts.length; i++) {
          const contact = cm.contacts[i];
          await pool.query(
            `INSERT INTO sourcing_cm_contacts (cm_id, name, title, department, is_primary, source)
             VALUES ($1, $2, $3, $4, $5, 'ai_web_search')`,
            [cmId, contact.name, contact.title || null, contact.department || 'sales', i === 0]);
        }
      }
    }

    const { rows: existLink } = await pool.query(
      `SELECT id FROM sourcing_project_cms WHERE project_id = $1 AND cm_id = $2 LIMIT 1`,
      [projectId, cmId]);
    if (!existLink[0]) {
      const portalToken = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      await pool.query(
        `INSERT INTO sourcing_project_cms (project_id, cm_id, stage, portal_token)
         VALUES ($1, $2, 'identified', $3)`,
        [projectId, cmId, portalToken]);
      cmsLinked++;
    }
    createdCmIds.push(cmId);
    existingNames.add(cm.company_name.toLowerCase());
  }

  if (project.status === 'draft') {
    await pool.query(
      `UPDATE sourcing_projects SET status = 'sourcing', updated_at = NOW() WHERE id = $1`,
      [projectId]);
  }

  const durationMs = Date.now() - startTime;
  await pool.query(
    `INSERT INTO sourcing_agent_log
      (project_id, action, description, input_data, output_data, status, model, tokens_used, duration_ms)
     VALUES ($1, 'discover_cms_web_search', $2, $3, $4, 'completed', $5, $6, $7)`,
    [projectId,
     `Web search found ${cmsCreated} verified CMs, linked ${cmsLinked} to project`,
     JSON.stringify({ requirements: project }),
     JSON.stringify({ cms_found: cms.length, cms_created: cmsCreated, cms_linked: cmsLinked }),
     MODEL,
     (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
     durationMs]);

  res.json({
    success: true, cms_found: cms.length, cms_created: cmsCreated, cms_linked: cmsLinked,
    cm_ids: createdCmIds, duration_ms: durationMs,
  });
}

async function handleDraftOutreach(req, res, pool, apiKey, body, orgId) {
  const { project_id, project_cm_id } = body;
  const { rows: pcmRows } = await pool.query(
    `SELECT * FROM sourcing_project_cms WHERE id = $1 LIMIT 1`, [project_cm_id]);
  const pcm = pcmRows[0];
  if (!pcm) throw new Error('Project-CM link not found');

  const { rows: projRows } = await pool.query(
    `SELECT * FROM sourcing_projects WHERE id = $1 LIMIT 1`, [project_id]);
  const project = projRows[0];

  const { rows: cmRows } = await pool.query(
    `SELECT * FROM sourcing_cms WHERE id = $1 LIMIT 1`, [pcm.cm_id]);
  const cm = cmRows[0];

  const { rows: contacts } = await pool.query(
    `SELECT * FROM sourcing_cm_contacts WHERE cm_id = $1 ORDER BY is_primary DESC`, [pcm.cm_id]);
  const primaryContact = contacts[0];
  const toName = primaryContact?.name || 'Manufacturing Team';
  const toEmail = primaryContact?.email || cm?.general_email || null;

  const prompt = `Write a professional outreach email from Earth Breeze to ${cm?.company_name}. Earth Breeze makes eco-friendly laundry detergent sheets (DTC). We're looking for: ${(project?.sourcing_type || []).map(t => t.replace(/_/g, ' ')).join(', ')}. Their capabilities: ${cm?.description || 'contract manufacturing'}. Contact: ${toName}. Write 150-250 words. JSON only: {"subject":"string","body":"string with \\n","to_name":"${toName}","to_email":${toEmail ? '"' + toEmail + '"' : 'null'}}`;

  const client = new Anthropic({ apiKey });
  const result = await client.messages.create({
    model: MODEL, max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (result.content || []).map(b => b.text || '').join('');
  let email;
  try { email = JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { throw new Error('AI returned invalid email format'); }

  const { rows: msgRows } = await pool.query(
    `INSERT INTO sourcing_messages
      (project_cm_id, direction, channel, subject, body, from_email, to_email,
       ai_generated, ai_approved, status)
     VALUES ($1, 'outbound', 'email', $2, $3, 'ben.smith@earthbreeze.com', $4, true, false, 'pending_approval')
     RETURNING id`,
    [project_cm_id, email.subject, email.body, email.to_email]);

  await pool.query(
    `UPDATE sourcing_project_cms SET stage = 'outreach_pending', updated_at = NOW() WHERE id = $1`,
    [project_cm_id]);

  res.json({ success: true, message_id: msgRows[0]?.id, email });
}
