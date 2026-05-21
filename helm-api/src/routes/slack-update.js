
const STATUS_LABELS = {
  approved: '\u2705 Approved',
  rejected: '\u274C Rejected',
  conditionally_approved: '\u2139\uFE0F More Info Requested',
  conditionally_approved_info_added: '\u{1F440} Info Submitted',
  removal_requested: '\u{1F5D1}\uFE0F Removal Requested',
  removed: '\u{1F5D1}\uFE0F Removed',
};

module.exports = function(app) {
  app.post('/slack-update', async (req, res) => {
    try {
      const { channel_id, message_ts, status, title, actor_name, note, url } = req.body || {};
      if (!channel_id || !message_ts) return res.status(400).json({ error: 'channel_id and message_ts required' });

      const slackToken = process.env.SLACK_BOT_TOKEN;
      if (!slackToken) return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });

      const label = STATUS_LABELS[status] || status;
      const headerLine = `${label} \u2014 ${title || 'Spend request'}`;
      const bodyLines = [];
      if (actor_name) bodyLines.push(`_by ${actor_name}_`);
      if (note) bodyLines.push(`> ${note}`);

      const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: `*${headerLine}*${bodyLines.length ? '\n' + bodyLines.join('\n') : ''}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `_Updated ${new Date().toUTCString()}_` }] },
      ];
      if (url) {
        blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Helm' }, url }] });
      }

      const slackRes = await fetch('https://slack.com/api/chat.update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackToken}` },
        body: JSON.stringify({ channel: channel_id, ts: message_ts, text: headerLine, blocks }),
      });
      const data = await slackRes.json();
      if (!data.ok) return res.status(500).json({ error: data.error, detail: data });
      return res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
};
