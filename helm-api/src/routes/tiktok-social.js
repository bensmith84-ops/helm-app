
// POST /tiktok-social — port of supabase/functions/tiktok-social
// 4 actions: get_oauth_url, oauth_callback, sync_comments, reply_comment.
const crypto = require('crypto');

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
  app.post('/tiktok-social', async (req, res) => {
    try {
      const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
      const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
      const body = req.body || {};
      const { action } = body;

      if (action === 'get_oauth_url') {
        const { redirect_uri } = body;
        const scope = 'user.info.basic,video.list,comment.list,comment.list.manage';
        const state = crypto.randomUUID();
        const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=${scope}&response_type=code&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${state}`;
        return res.json({ url, state });
      }

      if (action === 'oauth_callback') {
        const { code, redirect_uri, org_id } = body;
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET,
            code, grant_type: 'authorization_code', redirect_uri,
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error) return res.status(400).json({ error: tokenData.error_description || tokenData.error });

        const accessToken = tokenData.access_token;
        const openId = tokenData.open_id;

        const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,username', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const userData = await userRes.json();
        const u = userData.data?.user || {};

        const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;

        const { rows } = await pool.query(
          `INSERT INTO cx_social_accounts
            (org_id, platform, account_name, account_handle, account_id,
             access_token, refresh_token, token_expires_at, avatar_url, follower_count,
             is_connected, last_synced_at)
           VALUES ($1, 'tiktok', $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
           ON CONFLICT (org_id, platform, account_id) DO UPDATE
           SET account_name = EXCLUDED.account_name,
               account_handle = EXCLUDED.account_handle,
               access_token = EXCLUDED.access_token,
               refresh_token = EXCLUDED.refresh_token,
               token_expires_at = EXCLUDED.token_expires_at,
               avatar_url = EXCLUDED.avatar_url,
               follower_count = EXCLUDED.follower_count,
               is_connected = true, last_synced_at = NOW()
           RETURNING *`,
          [org_id, u.display_name || 'TikTok',
           u.username ? '@' + u.username : '@tiktok',
           openId, accessToken,
           tokenData.refresh_token || null, expiresAt,
           u.avatar_url || null, u.follower_count || 0]
        );

        return res.json({ account: rows[0] });
      }

      if (action === 'sync_comments') {
        const { account_id, org_id } = body;
        const { rows: aRows } = await pool.query(`SELECT * FROM cx_social_accounts WHERE id = $1 LIMIT 1`, [account_id]);
        const acct = aRows[0];
        if (!acct?.access_token) return res.status(400).json({ error: 'Not connected' });

        const vidRes = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url,comment_count', {
          method: 'POST',
          headers: { Authorization: `Bearer ${acct.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ max_count: 20 }),
        });
        const vidData = await vidRes.json();
        const videos = vidData.data?.videos || [];

        let newComments = 0;
        for (const vid of videos) {
          if (!vid.comment_count) continue;

          const cmtRes = await fetch(
            `https://open.tiktokapis.com/v2/comment/list/?fields=id,text,create_time,user_id,likes_count&video_id=${vid.id}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${acct.access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ max_count: 50 }),
            }
          );
          const cmtData = await cmtRes.json();

          for (const cmt of (cmtData.data?.comments || [])) {
            const { rows: exist } = await pool.query(
              `SELECT id FROM cx_social_mentions WHERE external_id = $1 AND org_id = $2 LIMIT 1`,
              [cmt.id, org_id]
            );
            if (exist[0]) continue;

            const postedAt = cmt.create_time ? new Date(cmt.create_time * 1000).toISOString() : new Date().toISOString();

            const { rows: mRows } = await pool.query(
              `INSERT INTO cx_social_mentions
                (org_id, social_account_id, platform, mention_type, author_handle,
                 content, post_url, post_id, post_text, external_id, likes,
                 posted_at, status, moderation_status)
               VALUES ($1, $2, 'tiktok', 'comment', $3, $4, $5, $6, $7, $8, $9, $10, 'new', $11)
               RETURNING id`,
              [org_id, account_id, cmt.user_id || '', cmt.text || '', vid.share_url, vid.id,
               (vid.title || '').substring(0, 200),
               cmt.id, cmt.likes_count || 0, postedAt,
               acct.auto_moderate ? 'pending' : null]
            );

            if (mRows[0]) {
              newComments++;
              if (acct.auto_moderate) {
                moderate({
                  action: 'moderate', org_id, mention_id: mRows[0].id,
                  content: cmt.text || '', platform: 'tiktok', author_handle: cmt.user_id,
                });
              }
            }
          }
        }

        await pool.query(`UPDATE cx_social_accounts SET last_comment_sync_at = NOW() WHERE id = $1`, [account_id]);
        return res.json({ synced: newComments, videos: videos.length });
      }

      if (action === 'reply_comment') {
        const { account_id, video_id, comment_id, reply_text } = body;
        const { rows } = await pool.query(
          `SELECT access_token FROM cx_social_accounts WHERE id = $1 LIMIT 1`,
          [account_id]
        );
        if (!rows[0]) return res.status(400).json({ error: 'Not connected' });

        const r = await fetch('https://open.tiktokapis.com/v2/comment/reply/', {
          method: 'POST',
          headers: { Authorization: `Bearer ${rows[0].access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id, comment_id, text: reply_text }),
        });
        const result = await r.json();
        return res.json({ success: !result.error, reply_id: result.data?.comment_id });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });
};
