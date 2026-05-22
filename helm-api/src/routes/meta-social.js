
// /meta-social — port of supabase/functions/meta-social
// 8 actions: webhook GET verify, oauth_callback, get_oauth_url,
// sync_ig_comments, sync_fb_comments, reply_ig/fb_comment, hide_comment,
// webhook POST. Facebook Graph v19 wrapper.

async function metaGet(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://graph.facebook.com/v19.0${path}${sep}access_token=${token}`);
  return r.json();
}

// Self-call helper — call our own cx-moderate endpoint
async function moderate(payload) {
  const selfUrl = process.env.SELF_URL || 'http://localhost:8080';
  try {
    await fetch(`${selfUrl}/cx-moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {}
}

module.exports = function(app, { pool }) {
  // GET = webhook verification
  app.get('/meta-social', (req, res) => {
    const META_WEBHOOK_TOKEN = process.env.META_WEBHOOK_TOKEN || 'helm_webhook_verify_2026';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === META_WEBHOOK_TOKEN) {
      return res.status(200).send(challenge);
    }
    res.status(403).send('Forbidden');
  });

  app.post('/meta-social', async (req, res) => {
    const META_APP_ID = process.env.META_APP_ID || '';
    const META_APP_SECRET = process.env.META_APP_SECRET || '';
    try {
      const body = req.body || {};
      const { action } = body;

      // ── OAuth callback ──
      if (action === 'oauth_callback') {
        const { code, redirect_uri, org_id } = body;
        const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirect_uri)}&code=${code}`);
        const tokenData = await tokenRes.json();
        if (tokenData.error) return res.status(400).json({ error: tokenData.error.message });

        const llRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`);
        const llData = await llRes.json();
        const longToken = llData.access_token || tokenData.access_token;

        const pagesRes = await metaGet('/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url,followers_count}', longToken);
        const pages = pagesRes.data || [];

        const accounts = [];
        for (const page of pages) {
          // FB page
          const { rows: fbRows } = await pool.query(
            `INSERT INTO cx_social_accounts
              (org_id, platform, account_name, account_handle, account_id, access_token, page_id, is_connected, last_synced_at)
             VALUES ($1, 'facebook', $2, $3, $4, $5, $6, true, NOW())
             ON CONFLICT (org_id, platform, account_id) DO UPDATE
             SET account_name = EXCLUDED.account_name, access_token = EXCLUDED.access_token,
                 is_connected = true, last_synced_at = NOW()
             RETURNING *`,
            [org_id, page.name, page.name, page.id, page.access_token, page.id]
          );
          if (fbRows[0]) accounts.push(fbRows[0]);

          // IG (if linked)
          const ig = page.instagram_business_account;
          if (ig) {
            const { rows: igRows } = await pool.query(
              `INSERT INTO cx_social_accounts
                (org_id, platform, account_name, account_handle, account_id, ig_user_id, page_id,
                 access_token, avatar_url, follower_count, is_connected, last_synced_at)
               VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
               ON CONFLICT (org_id, platform, account_id) DO UPDATE
               SET account_name = EXCLUDED.account_name, access_token = EXCLUDED.access_token,
                   avatar_url = EXCLUDED.avatar_url, follower_count = EXCLUDED.follower_count,
                   is_connected = true, last_synced_at = NOW()
               RETURNING *`,
              [org_id, ig.username || page.name, '@' + (ig.username || ''),
               ig.id, ig.id, page.id, page.access_token,
               ig.profile_picture_url, ig.followers_count || 0]
            );
            if (igRows[0]) accounts.push(igRows[0]);
          }
        }
        return res.json({ accounts, pages: pages.length });
      }

      // ── Get OAuth URL ──
      if (action === 'get_oauth_url') {
        const { redirect_uri } = body;
        const scopes = 'pages_show_list,pages_read_engagement,pages_manage_engagement,pages_read_user_content,pages_manage_posts,instagram_basic,instagram_manage_comments,instagram_manage_messages,pages_messaging';
        const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scopes}&response_type=code`;
        return res.json({ url: authUrl });
      }

      // ── Sync IG comments ──
      if (action === 'sync_ig_comments') {
        const { account_id, org_id } = body;
        const { rows: aRows } = await pool.query(`SELECT * FROM cx_social_accounts WHERE id = $1 LIMIT 1`, [account_id]);
        const acct = aRows[0];
        if (!acct?.access_token) return res.status(400).json({ error: 'Account not found or not connected' });

        const mediaRes = await metaGet(`/${acct.ig_user_id || acct.account_id}/media?fields=id,caption,timestamp,media_type,permalink,comments_count&limit=25`, acct.access_token);
        const posts = mediaRes.data || [];

        let newComments = 0;
        for (const post of posts) {
          if (!post.comments_count) continue;
          const commentsRes = await metaGet(`/${post.id}/comments?fields=id,text,timestamp,from{id,username},like_count&limit=50`, acct.access_token);

          for (const comment of (commentsRes.data || [])) {
            const { rows: exist } = await pool.query(
              `SELECT id FROM cx_social_mentions WHERE external_id = $1 AND org_id = $2 LIMIT 1`,
              [comment.id, org_id]
            );
            if (exist[0]) continue;

            const { rows: mRows } = await pool.query(
              `INSERT INTO cx_social_mentions
                (org_id, social_account_id, platform, mention_type, author_handle, author_name,
                 content, post_url, post_id, post_text, external_id, likes, posted_at, status, moderation_status)
               VALUES ($1, $2, 'instagram', 'comment', $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new', $12)
               RETURNING id`,
              [org_id, account_id,
               comment.from?.username ? '@' + comment.from.username : '',
               comment.from?.username || 'Unknown',
               comment.text || '', post.permalink, post.id,
               (post.caption || '').substring(0, 200),
               comment.id, comment.like_count || 0, comment.timestamp,
               acct.auto_moderate ? 'pending' : null]
            );
            if (mRows[0]) {
              newComments++;
              if (acct.auto_moderate) {
                moderate({
                  action: 'moderate', org_id, mention_id: mRows[0].id,
                  content: comment.text || '', platform: 'instagram',
                  author_handle: comment.from?.username ? '@' + comment.from.username : '',
                });
              }
            }
          }
        }

        await pool.query(
          `UPDATE cx_social_accounts SET last_comment_sync_at = NOW() WHERE id = $1`,
          [account_id]
        );
        return res.json({ synced: newComments, posts: posts.length });
      }

      // ── Sync FB comments ──
      if (action === 'sync_fb_comments') {
        const { account_id, org_id } = body;
        const { rows: aRows } = await pool.query(`SELECT * FROM cx_social_accounts WHERE id = $1 LIMIT 1`, [account_id]);
        const acct = aRows[0];
        if (!acct?.access_token) return res.status(400).json({ error: 'Account not found' });

        const postsRes = await metaGet(`/${acct.page_id}/posts?fields=id,message,created_time,permalink_url,comments{id,message,created_time,from{id,name},like_count}&limit=25`, acct.access_token);
        let newComments = 0;

        for (const post of (postsRes.data || [])) {
          for (const comment of (post.comments?.data || [])) {
            const { rows: exist } = await pool.query(
              `SELECT id FROM cx_social_mentions WHERE external_id = $1 AND org_id = $2 LIMIT 1`,
              [comment.id, org_id]
            );
            if (exist[0]) continue;

            const { rows: mRows } = await pool.query(
              `INSERT INTO cx_social_mentions
                (org_id, social_account_id, platform, mention_type, author_handle, author_name,
                 content, post_url, post_id, post_text, external_id, likes, posted_at, status, moderation_status)
               VALUES ($1, $2, 'facebook', 'comment', $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new', $12)
               RETURNING id`,
              [org_id, account_id,
               comment.from?.name || '', comment.from?.name || 'Unknown',
               comment.message || '', post.permalink_url, post.id,
               (post.message || '').substring(0, 200),
               comment.id, comment.like_count || 0, comment.created_time,
               acct.auto_moderate ? 'pending' : null]
            );
            if (mRows[0] && acct.auto_moderate) {
              newComments++;
              moderate({
                action: 'moderate', org_id, mention_id: mRows[0].id,
                content: comment.message || '', platform: 'facebook',
                author_handle: comment.from?.name || '',
              });
            }
          }
        }

        await pool.query(`UPDATE cx_social_accounts SET last_comment_sync_at = NOW() WHERE id = $1`, [account_id]);
        return res.json({ synced: newComments });
      }

      // ── Reply IG comment ──
      if (action === 'reply_ig_comment') {
        const { account_id, comment_id, reply_text } = body;
        const { rows } = await pool.query(`SELECT access_token FROM cx_social_accounts WHERE id = $1 LIMIT 1`, [account_id]);
        if (!rows[0]) return res.status(400).json({ error: 'Account not found' });

        const r = await fetch(`https://graph.facebook.com/v19.0/${comment_id}/replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: reply_text, access_token: rows[0].access_token }),
        });
        const result = await r.json();
        if (result.error) return res.status(400).json({ error: result.error.message });
        return res.json({ success: true, reply_id: result.id });
      }

      // ── Reply FB comment ──
      if (action === 'reply_fb_comment') {
        const { account_id, comment_id, reply_text } = body;
        const { rows } = await pool.query(`SELECT access_token FROM cx_social_accounts WHERE id = $1 LIMIT 1`, [account_id]);
        if (!rows[0]) return res.status(400).json({ error: 'Account not found' });

        const r = await fetch(`https://graph.facebook.com/v19.0/${comment_id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: reply_text, access_token: rows[0].access_token }),
        });
        const result = await r.json();
        if (result.error) return res.status(400).json({ error: result.error.message });
        return res.json({ success: true, reply_id: result.id });
      }

      // ── Hide comment ──
      if (action === 'hide_comment') {
        const { account_id, comment_id } = body;
        const { rows } = await pool.query(`SELECT access_token FROM cx_social_accounts WHERE id = $1 LIMIT 1`, [account_id]);
        if (!rows[0]) return res.status(400).json({ error: 'Account not found' });

        const r = await fetch(`https://graph.facebook.com/v19.0/${comment_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_hidden: true, access_token: rows[0].access_token }),
        });
        const result = await r.json();
        return res.json({ success: result.success || false });
      }

      // ── Webhook POST (real-time notifications) ──
      if (action === 'webhook' || !action) {
        const entry = body.entry || [];
        for (const e of entry) {
          for (const change of (e.changes || [])) {
            if (change.field === 'feed' && change.value?.item === 'comment') {
              const v = change.value;
              const { rows: aRows } = await pool.query(
                `SELECT * FROM cx_social_accounts WHERE page_id = $1 LIMIT 1`, [e.id]
              );
              const acct = aRows[0];
              if (!acct) continue;

              const { rows: exist } = await pool.query(
                `SELECT id FROM cx_social_mentions WHERE external_id = $1 AND org_id = $2 LIMIT 1`,
                [v.comment_id, acct.org_id]
              );
              if (exist[0]) continue;

              const { rows: mRows } = await pool.query(
                `INSERT INTO cx_social_mentions
                  (org_id, social_account_id, platform, mention_type, author_name,
                   content, external_id, post_id, posted_at, status, moderation_status)
                 VALUES ($1, $2, 'facebook', 'comment', $3, $4, $5, $6, NOW(), 'new', 'pending')
                 RETURNING id`,
                [acct.org_id, acct.id, v.from?.name || 'Unknown',
                 v.message || '', v.comment_id, v.post_id]
              );

              if (mRows[0] && acct.auto_moderate) {
                moderate({
                  action: 'moderate', org_id: acct.org_id,
                  mention_id: mRows[0].id, content: v.message || '',
                  platform: 'facebook', author_handle: v.from?.name,
                });
              }
            }
          }
        }
        return res.json({ received: true });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });
};
