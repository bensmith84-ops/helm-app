
// POST /doc-ai — port of supabase/functions/doc-ai
// AI assistant for the document editor (Notion-like). Multiple action types each
// with a specific system prompt. Logs AI sessions for analytics.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPTS = {
  write: `You are an expert writing assistant embedded in a Notion-like document editor called Helm.
Generate well-structured content based on the user's prompt. Use markdown formatting.
Return ONLY the content — no preamble, no explanation, no wrapping.`,
  continue: `You are a writing assistant. Continue writing from where the user left off.
Match the existing tone, style, and format. Return ONLY the continuation — no preamble.`,
  edit: `You are an editing assistant. Rewrite the provided text according to the user's instructions.
Return ONLY the edited text — no explanation of changes.`,
  summarize: `You are a summarization assistant. Provide a concise summary of the given content.
Return ONLY the summary — no preamble like "Here is a summary:".`,
  expand: `You are a writing assistant. Expand the given content with more detail, examples, and depth.
Maintain the same tone and style. Return ONLY the expanded content.`,
  shorten: `You are an editing assistant. Condense the given content while preserving all key information.
Return ONLY the shortened version.`,
  translate: `You are a translation assistant. Translate the given text to the specified language.
Return ONLY the translation — no notes about the translation.`,
  fix_grammar: `You are a proofreading assistant. Fix all grammar, spelling, and punctuation errors.
Return ONLY the corrected text. Do not explain the corrections.`,
  change_tone: `You are a writing assistant. Rewrite the text in the requested tone.
Return ONLY the rewritten text.`,
  explain: `You are an explanation assistant. Explain the given concept or text clearly.
Return ONLY the explanation.`,
  brainstorm: `You are a creative brainstorming assistant. Generate ideas based on the user's topic.
Return a bulleted list of ideas — no preamble.`,
  outline: `You are a document planning assistant. Create a structured outline for the requested topic.
Use hierarchical headings and bullet points. Return ONLY the outline.`,
  draft: `You are a professional writing assistant. Draft a complete document based on the user's requirements.
Use proper structure with headings, paragraphs, and formatting. Return ONLY the draft.`,
  extract_action_items: `You are a meeting/document analysis assistant. Extract all action items, tasks, and follow-ups from the given text.
Return a numbered list of action items. Each should include: the task, who it's assigned to (if mentioned), and any deadline (if mentioned).
Return ONLY the action items list.`,
  generate_from_template: `You are a document generation assistant. Fill in the given template with relevant, professional content based on the user's context.
Replace placeholder text with substantive content. Return ONLY the filled template.`,
  custom_prompt: `You are a versatile AI writing assistant embedded in a document editor called Helm.
Follow the user's instructions precisely. Return ONLY the requested content — no preamble or explanation.`,
};

// ── Markdown → blocks converter (preserved verbatim from edge function) ──
function parseInlineFormatting(text) {
  const segments = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    if (match[2]) segments.push({ type: 'text', text: match[2], annotations: { bold: true, italic: true } });
    else if (match[3]) segments.push({ type: 'text', text: match[3], annotations: { bold: true } });
    else if (match[4]) segments.push({ type: 'text', text: match[4], annotations: { italic: true } });
    else if (match[5]) segments.push({ type: 'text', text: match[5], annotations: { italic: true } });
    else if (match[6]) segments.push({ type: 'text', text: match[6], annotations: { code: true } });
    else if (match[7] && match[8]) segments.push({ type: 'link', text: match[7], url: match[8] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', text: text.slice(lastIndex) });
  if (segments.length === 0) segments.push({ type: 'text', text });
  return segments;
}

function markdownToBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim() || 'plain';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
      blocks.push({ type: 'code', content: [{ type: 'text', text: codeLines.join('\n') }], properties: { language: lang } });
      i++; continue;
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: `heading_${headingMatch[1].length}`, content: parseInlineFormatting(headingMatch[2]) });
      i++; continue;
    }
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: 'divider', content: [] }); i++; continue;
    }
    const todoMatch = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)/);
    if (todoMatch) {
      blocks.push({ type: 'todo', content: parseInlineFormatting(todoMatch[2]), properties: { checked: todoMatch[1] !== ' ' } });
      i++; continue;
    }
    const numberedMatch = line.match(/^\s*\d+[.)\s]\s*(.+)/);
    if (numberedMatch) { blocks.push({ type: 'numbered_list', content: parseInlineFormatting(numberedMatch[1]) }); i++; continue; }
    const bulletMatch = line.match(/^\s*[-*+]\s+(.+)/);
    if (bulletMatch) { blocks.push({ type: 'bulleted_list', content: parseInlineFormatting(bulletMatch[1]) }); i++; continue; }
    if (line.trim().startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { quoteLines.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      blocks.push({ type: 'quote', content: parseInlineFormatting(quoteLines.join(' ')) });
      continue;
    }
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') && !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') && !lines[i].trim().match(/^\s*[-*+]\s+/) &&
      !lines[i].trim().match(/^\s*\d+[.)\s]\s/) && !lines[i].trim().match(/^\s*[-*]\s*\[/) &&
      !lines[i].trim().match(/^---+$/) && !lines[i].trim().match(/^\*\*\*+$/)) {
      paraLines.push(lines[i]); i++;
    }
    blocks.push({ type: 'paragraph', content: parseInlineFormatting(paraLines.join(' ')) });
  }
  return blocks;
}

module.exports = function(app, { requireAuth, pool }) {
  app.post('/doc-ai', requireAuth, async (req, res) => {
    try {
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });

      const fbSub = req.firebase?.sub;
      let userId = null;
      if (fbSub) {
        const { rows } = await pool.query(`SELECT id FROM profiles WHERE firebase_uid = $1 LIMIT 1`, [fbSub]);
        if (rows[0]) userId = rows[0].id;
      }
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const { action, prompt, document_id, context = {} } = req.body || {};
      if (!action || !prompt || !document_id) return res.status(400).json({ success: false, error: 'action, prompt, and document_id are required' });

      const systemPrompt = SYSTEM_PROMPTS[action];
      if (!systemPrompt) return res.status(400).json({ success: false, error: `Unknown action: ${action}. Valid: ${Object.keys(SYSTEM_PROMPTS).join(', ')}` });

      let userMessage = '';
      if (context.document_title) userMessage += `Document title: "${context.document_title}"\n\n`;
      if (context.selected_text && ['edit','summarize','expand','shorten','translate','fix_grammar','change_tone','explain','extract_action_items'].includes(action)) {
        userMessage += `Text to work with:\n---\n${context.selected_text}\n---\n\n`;
      }
      if (context.surrounding_text && ['continue','write'].includes(action)) {
        userMessage += `Existing content for context:\n---\n${context.surrounding_text}\n---\n\n`;
      }
      if (context.full_document_text && action === 'extract_action_items') {
        userMessage += `Full document:\n---\n${context.full_document_text}\n---\n\n`;
      }
      if (context.template_content && action === 'generate_from_template') {
        userMessage += `Template structure:\n---\n${context.template_content}\n---\n\n`;
      }
      if (action === 'translate' && context.target_language) userMessage += `Translate to: ${context.target_language}\n\n`;
      if (action === 'change_tone' && context.target_tone) userMessage += `Target tone: ${context.target_tone}\n\n`;
      userMessage += `User request: ${prompt}`;

      const startTime = Date.now();
      const client = new Anthropic({ apiKey });
      const result = await client.messages.create({
        model: MODEL, max_tokens: 4096, system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const responseText = (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      const inputTokens = result.usage?.input_tokens || 0;
      const outputTokens = result.usage?.output_tokens || 0;
      const durationMs = Date.now() - startTime;
      const blocks = markdownToBlocks(responseText);

      // Persist AI session
      const { rows: sessRows } = await pool.query(
        `INSERT INTO document_ai_sessions
         (document_id, user_id, action_type, prompt, context, response, response_blocks, model_used, input_tokens, output_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [document_id, userId, action, prompt, JSON.stringify(context), responseText, JSON.stringify(blocks), MODEL, inputTokens, outputTokens]
      );
      const sessionId = sessRows[0]?.id;

      // Analytics
      await pool.query(
        `INSERT INTO document_analytics (document_id, user_id, event_type, metadata)
         VALUES ($1, $2, 'ai_assist', $3)`,
        [document_id, userId, JSON.stringify({ action, session_id: sessionId, duration_ms: durationMs })]
      );

      res.json({
        success: true,
        session_id: sessionId,
        action,
        response: responseText,
        blocks,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        duration_ms: durationMs,
      });
    } catch (err) {
      const msg = err?.message || String(err);
      res.status(msg.includes('Unauthorized') ? 401 : 400).json({ success: false, error: msg });
    }
  });
};
