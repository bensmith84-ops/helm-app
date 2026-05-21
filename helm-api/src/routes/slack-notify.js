
// POST /slack-notify — port of supabase/functions/slack-notify
// Posts Slack messages: either to a channel alias OR fans out as approver DMs.
// Uses the pg pool directly (admin role) since this is system-fired (cron, webhooks).

const DESTINATIONS = {
  ben:        { type: 'user',    id: 'U05BJ0CCPQS' },
  general:    { type: 'channel', id: 'C01A3CX3YRM' },
  operations: { type: 'channel', id: 'C046PBRNSUT' },
};

const TYPE_EMOJI = {
  okr: '\u{1F3AF}', task: '\u2610', plm: '\u2B22', approval: '\u23F3',
  finance: '\u{1F4CA}', alert: '\u{1F6A8}', info: '\u2139\uFE0F',
};

async function slackApi(token, path, body) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function openDM(token, userId) {
  const d = await slackApi(token, 'conversations.open', { users: userId });
  return d.ok ? d.channel.id : null;
}

function approvalButtons(requestId, title) {
  return [
    {
      type: 'button', action_id: 'spend_approve',
      text: { type: 'plain_text', text: '\u2705 Approve' },
      style: 'primary', value: `approve:${requestId}`,
      confirm: {
        title: { type: 'plain_text', text: 'Approve this request?' },
        text: { type: 'plain_text', text: title },
        confirm: { type: 'plain_text', text: 'Approve' },
        deny: { type: 'plain_text', text: 'Cancel' },
      },
    },
    { type: 'button', action_id: 'spend_reject',
      text: { type: 'plain_text', text: '\u274C Reject' },
      style: 'danger', value: `reject:${requestId}` },
    { type: 'button', action_id: 'spend_more_info',
      text: { type: 'plain_text', text: '\u2139\uFE0F Request Info' },
      value: `info:${requestId}` },
  ];
}

function buildBlocks({ emoji, title, message, fields, budget_context, actions, request_id, url }) {
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `${emoji} *${title}*\n${message}` } }];
  if (fields?.length) {
    blocks.push({
      type: 'section',
      fields: fields.slice(0, 10).map(f => ({ type: 'mrkdwn', text: `*${f.label}*\n${f.value}` })),
    });
  }
  if (budget_context && typeof budget_context === 'string' && budget_context.trim()) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: budget_context } });
  }
  const actionElements = [];
  if (actions === 'approval' && request_id) actionElements.push(...approvalButtons(request_id, title));
  if (url) actionElements.push({ type: 'button', text: { type: 'plain_text', text: 'View in Helm' }, url });
  if (actionElements.length) {
    blocks.push({ type: 'actions', block_id: `actions_${request_id || 'none'}`, elements: actionElements });
  }
  blocks.push({ type: 'divider' });
  return blocks;
}

module.exports = function(app, { pool }) {
  app.post('/slack-notify', async (req, res) => {
    try {
      const {
        channel = 'ben', type = 'info', title, message,
        url, fields, actions, request_id, budget_context, approver_user_ids,
      } = req.body || {};

      if (!title || !message) return res.status(400).json({ error: 'title and message are required' });

      const slackToken = process.env.SLACK_BOT_TOKEN;
      if (!slackToken) return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });

      const emoji = TYPE_EMOJI[type] || '\u{1F514}';
      const blocks = buildBlocks({ emoji, title, message, fields, budget_context, actions, request_id, url });

      // ── Per-approver DM fan-out ──
      if (Array.isArray(approver_user_ids) && approver_user_ids.length > 0) {
        const { rows: profs } = await pool.query(
          'SELECT id, display_name, slack_user_id FROM profiles WHERE id = ANY($1::uuid[])',
          [approver_user_ids]
        );
        const results = [];
        const missingSlackId = [];
        for (const p of profs) {
          if (!p.slack_user_id) {
            missingSlackId.push({ user_id: p.id, display_name: p.display_name });
            results.push({ user_id: p.id, status: 'skipped_no_slack_id' });
            continue;
          }
          const dm = await openDM(slackToken, p.slack_user_id);
          if (!dm) { results.push({ user_id: p.id, slack_user_id: p.slack_user_id, status: 'open_dm_failed' }); continue; }
          const post = await slackApi(slackToken, 'chat.postMessage', {
            channel: dm, text: `${emoji} ${title}: ${message}`, blocks,
          });
          if (!post.ok) {
            results.push({ user_id: p.id, slack_user_id: p.slack_user_id, status: 'post_failed', error: post.error });
            continue;
          }
          results.push({ user_id: p.id, slack_user_id: p.slack_user_id, status: 'sent', ts: post.ts, channel: post.channel });
        }
        const foundIds = new Set(profs.map(p => p.id));
        const notFound = approver_user_ids.filter(id => !foundIds.has(id));
        return res.json({
          success: results.some(r => r.status === 'sent'),
          mode: 'per_approver_dm',
          results, missing_slack_id: missingSlackId, not_found_profiles: notFound,
        });
      }

      // ── Single destination ──
      const dest = DESTINATIONS[channel] || { type: 'channel', id: channel };
      let channelId = dest.id;
      if (dest.type === 'user') {
        const dm = await openDM(slackToken, dest.id);
        if (!dm) return res.status(500).json({ error: 'Failed to open DM channel with user' });
        channelId = dm;
      }
      const post = await slackApi(slackToken, 'chat.postMessage', {
        channel: channelId, text: `${emoji} ${title}: ${message}`, blocks,
      });
      if (!post.ok) return res.status(500).json({ error: post.error, detail: post });
      return res.json({ success: true, mode: 'single', ts: post.ts, channel: post.channel });

    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });
};
