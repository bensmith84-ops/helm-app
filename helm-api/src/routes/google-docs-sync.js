
// POST /google-docs-sync — port of supabase/functions/google-docs-sync
// 7 actions: auth-url, callback, list-docs, link-doc, sync-doc, unlink-doc, disconnect.
// Uses 3-legged OAuth (not service account). Action passed in ?action= query param.
const ORG_ID_DEFAULT = 'a0000000-0000-0000-0000-000000000001';

async function refreshIfNeeded(pool, conn) {
  const expiresAt = new Date(conn.token_expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return conn.access_token;
  if (!conn.refresh_token) throw new Error('No refresh token. Please reconnect.');

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token, grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    await pool.query(`UPDATE google_drive_connections SET is_active = false WHERE id = $1`, [conn.id]);
    throw new Error(`Token refresh failed: ${errText}. Please reconnect.`);
  }
  const tokens = await r.json();
  await pool.query(
    `UPDATE google_drive_connections SET access_token = $1, token_expires_at = $2 WHERE id = $3`,
    [tokens.access_token,
     new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
     conn.id]
  );
  return tokens.access_token;
}

async function getValidAccessToken(pool, connectionId) {
  const { rows } = await pool.query(`SELECT * FROM google_drive_connections WHERE id = $1 LIMIT 1`, [connectionId]);
  const conn = rows[0];
  if (!conn) throw new Error('Connection not found');
  if (!conn.is_active) throw new Error('Connection is inactive. Please reconnect.');
  return refreshIfNeeded(pool, conn);
}

function plainTextToBlocks(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let order = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let blockType = 'paragraph';
    let content = line;
    const h = line.match(/^(#{1,3})\s+(.+)/);
    if (h) { blockType = `heading_${h[1].length}`; content = h[2]; }
    else if (line.match(/^\s*[-*]\s+/)) { blockType = 'bulleted_list'; content = line.replace(/^\s*[-*]\s+/, ''); }
    else if (line.match(/^\s*\d+[.)]\s+/)) { blockType = 'numbered_list'; content = line.replace(/^\s*\d+[.)]\s+/, ''); }
    blocks.push({ block_type: blockType, content: [{ type: 'text', text: content }], properties: {}, sort_order: order++ });
  }
  return blocks;
}

function convertGoogleDocToBlocks(doc) {
  const blocks = [];
  let order = 0;
  if (!doc.body?.content) return blocks;

  for (const element of doc.body.content) {
    if (element.sectionBreak) continue;
    if (element.paragraph) {
      const para = element.paragraph;
      const textSegments = [];
      let fullText = '';

      for (const elem of (para.elements || [])) {
        if (elem.textRun) {
          const text = elem.textRun.content || '';
          fullText += text;
          const annotations = {};
          if (elem.textRun.textStyle) {
            const style = elem.textRun.textStyle;
            if (style.bold) annotations.bold = true;
            if (style.italic) annotations.italic = true;
            if (style.underline) annotations.underline = true;
            if (style.strikethrough) annotations.strikethrough = true;
          }
          if (text.trim()) {
            textSegments.push({
              type: 'text', text,
              ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
            });
          }
        }
      }
      if (!fullText.trim()) continue;

      let blockType = 'paragraph';
      const namedStyle = para.paragraphStyle;
      if (namedStyle?.namedStyleType) {
        switch (namedStyle.namedStyleType) {
          case 'HEADING_1': blockType = 'heading_1'; break;
          case 'HEADING_2': blockType = 'heading_2'; break;
          case 'HEADING_3': blockType = 'heading_3'; break;
          case 'HEADING_4': case 'HEADING_5': case 'HEADING_6': blockType = 'heading_3'; break;
        }
      }
      if (para.bullet) blockType = 'bulleted_list';

      blocks.push({
        block_type: blockType,
        content: textSegments.length > 0 ? textSegments : [{ type: 'text', text: fullText }],
        properties: {},
        sort_order: order++,
      });
    }
  }
  return blocks;
}

async function importGoogleDoc(pool, accessToken, googleDocId, helmDocId, linkedDocId) {
  const docResp = await fetch(
    `https://docs.google.com/document/d/${googleDocId}/export?format=txt`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!docResp.ok) throw new Error(`Failed to fetch Google Doc: ${docResp.status}`);
  const plainText = await docResp.text();

  const structuredResp = await fetch(
    `https://docs.googleapis.com/v1/documents/${googleDocId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  let blocks = [];
  let docTitle = '';
  if (structuredResp.ok) {
    const docData = await structuredResp.json();
    docTitle = docData.title || '';
    blocks = convertGoogleDocToBlocks(docData);
  } else {
    blocks = plainTextToBlocks(plainText);
  }

  await pool.query(`DELETE FROM document_blocks WHERE document_id = $1`, [helmDocId]);

  if (blocks.length > 0) {
    const values = [];
    const params = [];
    let pi = 1;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++})`);
      params.push(helmDocId, b.block_type, JSON.stringify(b.content), JSON.stringify(b.properties || {}), i);
    }
    await pool.query(
      `INSERT INTO document_blocks (document_id, block_type, content, properties, sort_order)
       VALUES ${values.join(', ')}`,
      params
    );
  }

  await pool.query(
    `UPDATE documents SET title = COALESCE($1, title), content_text = $2, updated_at = NOW() WHERE id = $3`,
    [docTitle || null, plainText, helmDocId]
  );

  await pool.query(
    `UPDATE linked_google_docs
     SET cached_content_text = $1, cached_at = NOW(),
         last_synced_at = NOW(), title = COALESCE($2, title)
     WHERE id = $3`,
    [plainText.substring(0, 50000), docTitle || null, linkedDocId]
  );
}

module.exports = function(app, { pool }) {
  app.post('/google-docs-sync', async (req, res) => {
    try {
      const action = req.query.action;
      const body = req.body || {};
      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
      const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
      const GOOGLE_REDIRECT_URI = process.env.OAUTH_REDIRECT_GOOGLE_DOCS
        || process.env.GOOGLE_REDIRECT_URI
        || (process.env.OAUTH_REDIRECT_BASE ? `${process.env.OAUTH_REDIRECT_BASE}/google-docs-sync` : '')
        || '';

      // userId comes from Firebase auth context if available
      const userId = req.user?.helm_user?.uid || null;

      if (action === 'auth-url') {
        if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID not configured');
        const state = JSON.stringify({ user_id: userId, org_id: body.org_id });
        const stateB64 = Buffer.from(state).toString('base64');
        const scopes = [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/documents.readonly',
          'https://www.googleapis.com/auth/userinfo.email',
        ].join(' ');
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
          `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent(scopes)}` +
          `&access_type=offline&prompt=consent` +
          `&state=${encodeURIComponent(stateB64)}`;
        return res.json({ success: true, auth_url: authUrl });
      }

      if (action === 'callback') {
        const { code, state: stateB64 } = body;
        if (!code) throw new Error('Authorization code required');
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code',
          }),
        });
        if (!tokenResp.ok) throw new Error(`Token exchange failed: ${await tokenResp.text()}`);
        const tokens = await tokenResp.json();

        const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await userInfoResp.json();

        let stateData = { user_id: userId, org_id: '' };
        if (stateB64) {
          try { stateData = JSON.parse(Buffer.from(stateB64, 'base64').toString('utf8')); } catch {}
        }
        const callerId = stateData.user_id || userId;
        if (!callerId) throw new Error('User ID required');

        const { rows } = await pool.query(
          `INSERT INTO google_drive_connections
            (org_id, user_id, google_email, access_token, refresh_token, token_expires_at,
             scopes, is_active, last_synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
           ON CONFLICT (org_id, user_id, google_email) DO UPDATE
           SET access_token = EXCLUDED.access_token,
               refresh_token = EXCLUDED.refresh_token,
               token_expires_at = EXCLUDED.token_expires_at,
               scopes = EXCLUDED.scopes,
               is_active = true,
               last_synced_at = NOW()
           RETURNING *`,
          [stateData.org_id || ORG_ID_DEFAULT, callerId, userInfo.email,
           tokens.access_token, tokens.refresh_token,
           new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
           tokens.scope ? tokens.scope.split(' ') : []]
        );
        return res.json({ success: true, connection_id: rows[0].id, google_email: userInfo.email });
      }

      if (action === 'list-docs') {
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { connection_id, query, page_token } = body;
        const accessToken = await getValidAccessToken(pool, connection_id);

        let driveUrl = `https://www.googleapis.com/drive/v3/files?` +
          `q=${encodeURIComponent("mimeType='application/vnd.google-apps.document'" + (query ? ` and fullText contains '${query}'` : ''))}` +
          `&fields=files(id,name,modifiedTime,owners,thumbnailLink,webViewLink),nextPageToken` +
          `&pageSize=20&orderBy=modifiedTime desc`;
        if (page_token) driveUrl += `&pageToken=${encodeURIComponent(page_token)}`;

        const driveResp = await fetch(driveUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!driveResp.ok) throw new Error(`Drive API error: ${await driveResp.text()}`);
        const driveData = await driveResp.json();

        return res.json({
          success: true,
          files: driveData.files || [],
          next_page_token: driveData.nextPageToken || null,
        });
      }

      if (action === 'link-doc') {
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { connection_id, google_doc_id, google_doc_url, title, org_id, sync_mode, parent_id, project_id, team_id } = body;
        if (!google_doc_id || !org_id || !connection_id) {
          throw new Error('connection_id, google_doc_id, and org_id required');
        }

        const { rows: docRows } = await pool.query(
          `INSERT INTO documents
            (org_id, title, doc_type, status, visibility, parent_id, project_id, team_id,
             emoji, created_by, last_edited_by, metadata)
           VALUES ($1, $2, $3, 'published', 'team', $4, $5, $6, '\u{1F4C4}', $7, $8, $9)
           RETURNING id`,
          [org_id, title || 'Linked Google Doc',
           sync_mode === 'link_only' ? 'imported' : 'synced',
           parent_id || null, project_id || null, team_id || null,
           userId, userId,
           JSON.stringify({ source: 'google_docs', google_doc_id })]
        );
        const helmDocId = docRows[0].id;

        const { rows: linkRows } = await pool.query(
          `INSERT INTO linked_google_docs
            (org_id, document_id, connection_id, google_doc_id, google_doc_url,
             title, sync_mode, sync_status, linked_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'synced', $8)
           RETURNING id`,
          [org_id, helmDocId, connection_id, google_doc_id,
           google_doc_url || `https://docs.google.com/document/d/${google_doc_id}/edit`,
           title, sync_mode || 'link_only', userId]
        );
        const linkedId = linkRows[0].id;

        if (sync_mode && sync_mode !== 'link_only') {
          try {
            const accessToken = await getValidAccessToken(pool, connection_id);
            await importGoogleDoc(pool, accessToken, google_doc_id, helmDocId, linkedId);
          } catch (importErr) {
            await pool.query(
              `UPDATE linked_google_docs SET sync_status = 'error', sync_error = $1 WHERE id = $2`,
              [importErr?.message, linkedId]
            );
          }
        }

        await pool.query(
          `INSERT INTO document_links (source_doc_id, link_type, target_type, target_url)
           VALUES ($1, 'embed', 'google_doc', $2)`,
          [helmDocId, google_doc_url || `https://docs.google.com/document/d/${google_doc_id}/edit`]
        );

        return res.json({ success: true, helm_document_id: helmDocId, linked_google_doc_id: linkedId, sync_mode });
      }

      if (action === 'sync-doc') {
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { linked_doc_id } = body;
        const { rows } = await pool.query(`SELECT * FROM linked_google_docs WHERE id = $1 LIMIT 1`, [linked_doc_id]);
        const linked = rows[0];
        if (!linked) throw new Error('Linked doc not found');
        if (linked.sync_mode === 'link_only') throw new Error('Cannot sync a link-only document. Change sync mode first.');

        await pool.query(`UPDATE linked_google_docs SET sync_status = 'syncing' WHERE id = $1`, [linked_doc_id]);

        try {
          const accessToken = await getValidAccessToken(pool, linked.connection_id);
          await importGoogleDoc(pool, accessToken, linked.google_doc_id, linked.document_id, linked_doc_id);
          await pool.query(
            `UPDATE linked_google_docs SET sync_status = 'synced', last_synced_at = NOW(), sync_error = NULL WHERE id = $1`,
            [linked_doc_id]
          );
          return res.json({ success: true, synced: true });
        } catch (syncErr) {
          await pool.query(
            `UPDATE linked_google_docs SET sync_status = 'error', sync_error = $1 WHERE id = $2`,
            [syncErr?.message, linked_doc_id]
          );
          throw syncErr;
        }
      }

      if (action === 'unlink-doc') {
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { linked_doc_id, delete_helm_doc } = body;
        const { rows } = await pool.query(`SELECT document_id FROM linked_google_docs WHERE id = $1 LIMIT 1`, [linked_doc_id]);
        await pool.query(`DELETE FROM linked_google_docs WHERE id = $1`, [linked_doc_id]);
        if (delete_helm_doc && rows[0]?.document_id) {
          await pool.query(`UPDATE documents SET deleted_at = NOW() WHERE id = $1`, [rows[0].document_id]);
        }
        return res.json({ success: true, unlinked: true });
      }

      if (action === 'disconnect') {
        if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { connection_id } = body;
        await pool.query(
          `UPDATE google_drive_connections SET is_active = false, access_token = NULL, refresh_token = NULL
           WHERE id = $1 AND user_id = $2`,
          [connection_id, userId]
        );
        return res.json({ success: true, disconnected: true });
      }

      throw new Error(`Unknown action: ${action}. Valid: auth-url, callback, list-docs, link-doc, sync-doc, unlink-doc, disconnect`);
    } catch (err) {
      const message = err?.message || String(err);
      const status = message.includes('Unauthorized') ? 401 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });
};
