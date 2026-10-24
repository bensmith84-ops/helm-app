// POST /notification-dispatch - port of supabase/functions/notification-dispatch
// Delivers pending Helm notifications to Slack DMs for users who have opted in.
// In-app delivery already happens via the notifications table; this only handles
// the external channel and marks delivery state.
//
// POST {}                       -> dispatch pending notifications
// POST { link_user_id: "..." }  -> resolve one user's Slack ID by email
// POST { link_all: true }       -> resolve Slack IDs for everyone with slack_enabled
// POST { test_user_id: "..." }  -> send that user a test DM

const APP_URL = process.env.HELM_APP_URL || 'https://helm-app-qp7o2dcl5a-uc.a.run.app';

async function slack(method, body) {
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify(body),
  });
  return r.json();
}

// users.lookupByEmail is a form-encoded method - JSON bodies are rejected
// with invalid_arguments, so it needs its own transport.
async function slackForm(method, params) {
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    body: new URLSearchParams(params).toString(),
  });
  return r.json();
}

async function lookupSlackId(email) {
  const res = await slackForm('users.lookupByEmail', { email });
  if (res.ok && res.user?.id) return { id: res.user.id, status: 'linked' };
  return { id: null, status: res.error === 'users_not_found' ? 'not_found' : `error:${res.error}` };
}

const TYPE_META = {
  mention:       { emoji: '\u{1F4AC}', verb: 'mentioned you' },
  assignment:    { emoji: '\u{1F4CC}', verb: 'assigned you' },
  comment:       { emoji: '\u{1F5E8}️', verb: 'commented' },
  doc_comment:   { emoji: '\u{1F4DD}', verb: 'commented on a doc' },
  doc_edit:      { emoji: '\u{1F4DD}', verb: 'edited a doc' },
  project_added: { emoji: '\u{1F4C1}', verb: 'added you to a project' },
  task_overdue:  { emoji: '⏰', verb: 'overdue' },
  okr_deadline:  { emoji: '\u{1F3AF}', verb: 'OKR deadline' },
};

function blocksFor(n, actorName) {
  const meta = TYPE_META[n.type] || { emoji: '\u{1F514}', verb: 'update' };
  const link = n.link ? (String(n.link).startsWith('http') ? n.link : `${APP_URL}${n.link}`) : APP_URL;
  const lines = [`${meta.emoji}  *${n.title || meta.verb}*`];
  if (n.body) lines.push(String(n.body).slice(0, 600));
  if (actorName) lines.push(`_from ${actorName}_`);
  return [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Helm' }, url: link, style: 'primary' }] },
  ];
}

module.exports = function(app, { pool }) {
  const handler = async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};

      if (body.link_user_id || body.link_all) {
        const { rows: prefs } = body.link_user_id
          ? await pool.query('SELECT user_id, slack_enabled, slack_user_id FROM notification_preferences WHERE user_id = $1', [body.link_user_id])
          : await pool.query('SELECT user_id, slack_enabled, slack_user_id FROM notification_preferences WHERE slack_enabled = true AND slack_user_id IS NULL');
        const results = [];
        for (const p of prefs) {
          const { rows: pr } = await pool.query('SELECT email, display_name FROM profiles WHERE id = $1 LIMIT 1', [p.user_id]);
          const prof = pr[0] || null;
          if (!prof?.email) { results.push({ user_id: p.user_id, status: 'no_email' }); continue; }
          const { id, status } = await lookupSlackId(prof.email);
          await pool.query(
            'UPDATE notification_preferences SET slack_user_id = $1, slack_link_status = $2, slack_linked_at = $3 WHERE user_id = $4',
            [id, status, new Date().toISOString(), p.user_id]
          );
          results.push({ user_id: p.user_id, email: prof.email, slack_user_id: id, status });
        }
        return res.json({ ok: true, linked: results.filter(r => r.status === 'linked').length, results });
      }

      if (body.test_user_id) {
        const { rows } = await pool.query('SELECT slack_user_id FROM notification_preferences WHERE user_id = $1 LIMIT 1', [body.test_user_id]);
        const p = rows[0] || null;
        if (!p?.slack_user_id) return res.status(400).json({ ok: false, error: 'not_linked' });
        const r = await slack('chat.postMessage', {
          channel: p.slack_user_id,
          text: 'Helm notifications are connected.',
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: "✅  *Helm notifications are connected.*\nYou'll get mentions, assignments and comments here. Change this any time in Helm under Settings → Notifications." } }],
        });
        return res.json({ ok: r.ok, slack: r });
      }

      const { rows: pending } = await pool.query(
        `SELECT id, user_id, type, title, body, link, actor_id, category, created_at
           FROM notifications
          WHERE delivery_status = 'pending' AND created_at >= $1
          ORDER BY created_at ASC
          LIMIT 200`,
        [new Date(Date.now() - 7 * 864e5).toISOString()]
      );
      if (!pending.length) return res.json({ ok: true, pending: 0, sent: 0 });

      const userIds = [...new Set(pending.map(n => n.user_id))];
      const { rows: prefs } = await pool.query(
        'SELECT user_id, slack_enabled, slack_user_id, category_settings FROM notification_preferences WHERE user_id = ANY($1)',
        [userIds]
      );
      const prefBy = Object.fromEntries(prefs.map(p => [p.user_id, p]));

      const actorIds = [...new Set(pending.map(n => n.actor_id).filter(Boolean))];
      const actors = actorIds.length
        ? (await pool.query('SELECT id, display_name, email FROM profiles WHERE id = ANY($1)', [actorIds])).rows
        : [];
      const actorBy = Object.fromEntries(actors.map(a => [a.id, a.display_name || a.email]));

      const setStatus = (id, status, pushed) => pushed
        ? pool.query('UPDATE notifications SET delivery_status = $1, push_sent_at = $2 WHERE id = $3', [status, new Date().toISOString(), id])
        : pool.query('UPDATE notifications SET delivery_status = $1 WHERE id = $2', [status, id]);

      let sent = 0, skipped = 0, failed = 0;
      const detail = [];

      for (const n of pending) {
        const p = prefBy[n.user_id];
        if (!p || !p.slack_enabled || !p.slack_user_id) {
          await setStatus(n.id, 'in_app_only');
          skipped++; continue;
        }
        const cat = n.category || n.type;
        if (p.category_settings && p.category_settings[cat] === false) {
          await setStatus(n.id, 'muted');
          skipped++; continue;
        }
        const r = await slack('chat.postMessage', {
          channel: p.slack_user_id,
          text: n.title || 'Helm notification',
          blocks: blocksFor(n, actorBy[n.actor_id] || null),
        });
        if (r.ok) {
          await setStatus(n.id, 'delivered', true);
          sent++;
        } else {
          await setStatus(n.id, `failed:${r.error}`.slice(0, 40));
          failed++; detail.push({ id: n.id, error: r.error });
        }
      }

      return res.json({ ok: true, pending: pending.length, sent, skipped, failed, failures: detail.slice(0, 10) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  };
  app.post('/notification-dispatch', handler);
  app.get('/notification-dispatch', handler);
};
