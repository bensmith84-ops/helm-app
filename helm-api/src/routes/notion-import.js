
// POST /notion-import — port of supabase/functions/notion-import
// Accepts parsed Notion pages, creates Helm documents with parent_id mapping.
const Anthropic = require('@anthropic-ai/sdk');
const ORG_ID = 'a0000000-0000-0000-0000-000000000001';

function markdownToBlocks(md) {
  const lines = (md || '').split('\n');
  const blocks = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = '';

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push({ type: 'code', content: codeContent.trim(), language: codeLang });
        inCodeBlock = false; codeContent = ''; codeLang = '';
      } else {
        inCodeBlock = true; codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) { codeContent += line + '\n'; continue; }

    const trimmed = line.trim();
    if (!trimmed) { blocks.push({ type: 'text', content: '' }); continue; }

    if (trimmed.startsWith('### ')) { blocks.push({ type: 'h3', content: trimmed.slice(4) }); continue; }
    if (trimmed.startsWith('## ')) { blocks.push({ type: 'h2', content: trimmed.slice(3) }); continue; }
    if (trimmed.startsWith('# ')) { blocks.push({ type: 'h1', content: trimmed.slice(2) }); continue; }

    const indent = line.length - line.trimStart().length;
    const indentLevel = Math.floor(indent / 2);

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('\u2022 ')) {
      blocks.push({ type: 'bullet', content: trimmed.slice(2), indent: indentLevel > 0 ? indentLevel : undefined });
      continue;
    }
    if (trimmed.startsWith('\u25e6 ') || trimmed.startsWith('\u25aa ') || trimmed.startsWith('\u25ab ')) {
      blocks.push({ type: 'bullet', content: trimmed.slice(2), indent: indentLevel > 0 ? indentLevel : 1 });
      continue;
    }

    const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numMatch) { blocks.push({ type: 'numbered', content: numMatch[1], indent: indentLevel > 0 ? indentLevel : undefined }); continue; }

    if (trimmed.startsWith('- [ ] ')) { blocks.push({ type: 'todo', content: trimmed.slice(6), checked: false }); continue; }
    if (trimmed.startsWith('- [x] ') || trimmed.startsWith('- [X] ')) { blocks.push({ type: 'todo', content: trimmed.slice(6), checked: true }); continue; }

    if (trimmed.startsWith('> ')) { blocks.push({ type: 'quote', content: trimmed.slice(2) }); continue; }
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') { blocks.push({ type: 'divider', content: '' }); continue; }

    const calloutMatch = trimmed.match(/^([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])\s+(.+)/u);
    if (calloutMatch) { blocks.push({ type: 'callout', content: calloutMatch[2], emoji: calloutMatch[1] }); continue; }

    blocks.push({ type: 'text', content: trimmed });
  }

  const cleaned = [];
  let lastWasEmpty = false;
  for (const b of blocks) {
    if (b.type === 'text' && !b.content) {
      if (!lastWasEmpty) cleaned.push(b);
      lastWasEmpty = true;
    } else {
      cleaned.push(b);
      lastWasEmpty = false;
    }
  }
  return cleaned;
}

module.exports = function(app, { pool }) {
  app.post('/notion-import', async (req, res) => {
    try {
      const body = req.body || {};
      const { action } = body;
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();

      if (action === 'import') {
        const { pages, user_id, parent_doc_id, use_ai } = body;
        if (!pages || !Array.isArray(pages)) return res.status(400).json({ error: 'pages array required' });
        if (!user_id) return res.status(400).json({ error: 'user_id required' });

        let imported = 0;
        const idMap = {};

        const sorted = [...pages].sort((a, b) => {
          const aD = (a.path || '').split('/').length;
          const bD = (b.path || '').split('/').length;
          return aD - bD;
        });

        const client = apiKey ? new Anthropic({ apiKey }) : null;

        for (const page of sorted) {
          try {
            let parentId = parent_doc_id || null;
            if (page.path) {
              const parts = page.path.split('/');
              if (parts.length > 1) {
                const parentPath = parts.slice(0, -1).join('/');
                if (idMap[parentPath]) parentId = idMap[parentPath];
              }
            }

            let contentMd = page.content_md || '';

            if (use_ai && client && contentMd.length > 100) {
              const looksFlat = contentMd.split('\n').filter(l => l.trim()).length <= 3 && contentMd.length > 300;
              if (looksFlat || !contentMd.includes('\n- ')) {
                try {
                  const r = await client.messages.create({
                    model: 'claude-sonnet-4-20250514', max_tokens: 4000,
                    system: 'You are reformatting a Notion page export into clean, structured markdown. The original content may have lost its formatting during export. Your job is to reconstruct the logical structure: identify headers, bullet points, sub-bullets, bold text, numbered lists, and organize them properly. Return ONLY the reformatted markdown — no explanation, no code fences.',
                    messages: [{
                      role: 'user',
                      content: `Restructure this exported Notion content into clean markdown with proper headers, bullet points, and nesting:\n\nTitle: ${page.title}\n\nContent:\n${contentMd.slice(0, 8000)}`,
                    }],
                  });
                  const cleaned = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
                  if (cleaned.length > 50) contentMd = cleaned;
                } catch (_) { /* Use original */ }
              }
            }

            const blocks = markdownToBlocks(contentMd);
            const plainText = contentMd.replace(/[#*`>\[\]()\-_]/g, ' ').replace(/\s+/g, ' ').trim();
            const wordCount = plainText.split(/\s+/).filter(Boolean).length;

            const { rows } = await pool.query(
              `INSERT INTO documents
                (org_id, title, content, content_text, parent_id, emoji, status, visibility,
                 doc_type, created_by, last_edited_by, word_count, reading_time_minutes, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, 'published', 'team',
                       $7, $8, $9, $10, $11, $12)
               RETURNING id`,
              [ORG_ID, page.title || 'Untitled',
               JSON.stringify(blocks), plainText.slice(0, 50000),
               parentId, page.emoji || '\u{1F4C4}',
               page.is_database ? 'database' : 'imported',
               user_id, user_id, wordCount,
               Math.max(1, Math.ceil(wordCount / 200)),
               JSON.stringify({
                 imported_from: 'notion',
                 original_path: page.path,
                 imported_at: new Date().toISOString(),
                 ai_cleaned: use_ai || false,
               })]
            );

            if (rows[0]) {
              idMap[page.path || page.title] = rows[0].id;
              imported++;
            }
          } catch (e) {
            console.error(`[notion-import] Failed '${page.title}':`, e?.message);
          }
        }

        return res.json({ success: true, imported, total: pages.length });
      }

      return res.status(400).json({ error: 'Unknown action. Use: import' });
    } catch (e) {
      console.error('[notion-import]', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
