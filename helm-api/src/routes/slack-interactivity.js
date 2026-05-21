
// POST /slack-interactivity — port of supabase/functions/slack-interactivity
// Slack interactive button + modal callbacks for the spend-request workflow.
// CRITICAL: Slack signature verification requires the RAW body bytes.
// We use express.raw for this route only, then parse the URL-encoded body manually.
const express = require('express');
const crypto = require('crypto');

const AUTHORIZED_SLACK_USERS = new Set(['U05BJ0CCPQS']);
const SLACK_USER_TO_HELM_EMAIL = {
  'U05BJ0CCPQS': 'ben.smith@earthbreeze.com',
};

const APPROVAL_CHAINS = {
  standard: [{ role: 'Mgr', label: 'Manager' }, { role: 'CFO', label: 'CFO' }],
  high_value: [{ role: 'Mgr', label: 'Manager' }, { role: 'CFO', label: 'CFO' }, { role: 'CEO', label: 'CEO' }],
};

const HELM_URL = 'https://helm-app-six.vercel.app';

const STATUS_LABELS = {
  approved: '\u2705 Approved',
  rejected: '\u274c Rejected',
  conditionally_approved: '\u2139\ufe0f More Info Requested',
  partially_approved: '\u2705 Step approved',
};

function verifySlackSig(rawBody, headers) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;
  const ts = headers['x-slack-request-timestamp'];
  const sig = headers['x-slack-signature'];
  if (!ts || !sig) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 60 * 5) return false;
  const baseString = `v0:${ts}:${rawBody}`;
  const macHex = crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
  const expected = `v0=${macHex}`;
  if (expected.length !== sig.length) return false;
  // Timing-safe compare
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

function outcomeBlocks(status, title, actorName, note) {
  const headerLine = `${STATUS_LABELS[status] || status} \u2014 ${title}`;
  const bodyLines = [];
  if (actorName) bodyLines.push(`_by ${actorName} via Slack_`);
  if (note) bodyLines.push(`> ${note}`);
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `*${headerLine}*${bodyLines.length ? '\n' + bodyLines.join('\n') : ''}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `_Action recorded ${new Date().toUTCString()}_` }] },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Helm' }, url: HELM_URL }] },
  ];
}

async function openModal(token, triggerId, view) {
  const r = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ trigger_id: triggerId, view }),
  });
  const data = await r.json();
  if (!data.ok) console.error('views.open error:', data);
  return data;
}

function rejectModal(requestId, channelId, messageTs, title) {
  return {
    type: 'modal',
    callback_id: 'spend_reject_modal',
    private_metadata: JSON.stringify({ request_id: requestId, channel_id: channelId, message_ts: messageTs, title }),
    title: { type: 'plain_text', text: 'Reject Spend Request' },
    submit: { type: 'plain_text', text: 'Reject' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } },
      { type: 'input', block_id: 'reason_block', label: { type: 'plain_text', text: 'Reason for rejection' },
        element: { type: 'plain_text_input', action_id: 'reason_input', multiline: true,
                   placeholder: { type: 'plain_text', text: 'Why is this being rejected?' } } },
    ],
  };
}

function moreInfoModal(requestId, channelId, messageTs, title) {
  return {
    type: 'modal',
    callback_id: 'spend_more_info_modal',
    private_metadata: JSON.stringify({ request_id: requestId, channel_id: channelId, message_ts: messageTs, title }),
    title: { type: 'plain_text', text: 'Request More Info' },
    submit: { type: 'plain_text', text: 'Send' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } },
      { type: 'input', block_id: 'question_block', label: { type: 'plain_text', text: 'What additional info do you need?' },
        element: { type: 'plain_text_input', action_id: 'question_input', multiline: true,
                   placeholder: { type: 'plain_text', text: 'e.g. Can you attach the quote? Need a breakdown by line item.' } } },
    ],
  };
}

async function updateOriginalMessage(token, channelId, messageTs, blocks, fallbackText) {
  if (!channelId || !messageTs) return;
  const r = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: channelId, ts: messageTs, text: fallbackText, blocks }),
  });
  const data = await r.json();
  if (!data.ok) console.error('chat.update error:', data);
  return data;
}

async function resolveActor(pool, slackUserId) {
  const email = SLACK_USER_TO_HELM_EMAIL[slackUserId];
  if (!email) return { id: null, name: 'Slack user' };
  const { rows } = await pool.query(`SELECT id, display_name FROM profiles WHERE email = $1 LIMIT 1`, [email]);
  return { id: rows[0]?.id || null, name: rows[0]?.display_name || 'Slack user' };
}

async function handleBlockActions(payload, pool, slackToken) {
  const action = payload.actions?.[0];
  if (!action) return { status: 400, body: { error: 'no action' } };
  const slackUserId = payload.user?.id;
  if (!AUTHORIZED_SLACK_USERS.has(slackUserId)) {
    return { status: 200, body: { replace_original: false, response_type: 'ephemeral',
      text: '\u26d4 You\'re not authorized to act on Helm spend requests.' } };
  }

  const [actionType, requestId] = String(action.value || '').split(':');
  if (!requestId) return { status: 400, body: { error: 'malformed action value' } };

  const { rows: reqRows } = await pool.query(`SELECT * FROM af_requests WHERE id = $1 LIMIT 1`, [requestId]);
  const reqRow = reqRows[0];
  if (!reqRow) {
    return { status: 200, body: { replace_original: false, response_type: 'ephemeral',
      text: `\u26a0\ufe0f Request not found (${requestId}).` } };
  }

  const channelId = payload.channel?.id || payload.container?.channel_id;
  const messageTs = payload.message?.ts || payload.container?.message_ts;

  if (actionType === 'approve') {
    if (!['pending', 'conditionally_approved_info_added'].includes(reqRow.status)) {
      return { status: 200, body: { replace_original: false, response_type: 'ephemeral',
        text: `\u26a0\ufe0f Can't approve \u2014 request is currently *${reqRow.status}*.` } };
    }
    const actor = await resolveActor(pool, slackUserId);
    const isPersonChain = String(reqRow.approval_chain || '').startsWith('person_');
    const chain = isPersonChain ? [{ role: 'Approver' }] : (APPROVAL_CHAINS[reqRow.approval_chain] || APPROVAL_CHAINS.standard);
    const newStep = (reqRow.approval_step || 0) + 1;
    const done = isPersonChain || newStep >= chain.length;
    const today = new Date().toISOString().slice(0, 10);

    const updates = {
      approval_step: newStep,
      status: done ? 'approved' : 'pending',
      approvals: [...(reqRow.approvals || []), { step: reqRow.approval_step || 0, by: actor.id, at: today }],
      fulfillment_status: done ? 'awaiting_payment' : reqRow.fulfillment_status,
    };

    await pool.query(
      `UPDATE af_requests SET
        approval_step = $1, status = $2, approvals = $3, fulfillment_status = $4, updated_at = NOW()
       WHERE id = $5`,
      [updates.approval_step, updates.status, JSON.stringify(updates.approvals), updates.fulfillment_status, requestId]
    );
    await pool.query(
      `INSERT INTO af_audit_log (action, detail, request_id, user_id, user_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [done ? 'Request approved (via Slack)' : `Approval step ${newStep} (via Slack)`,
       `"${reqRow.title}" ${done ? 'fully approved' : 'step approved'} by ${actor.name}`,
       requestId, actor.id, actor.name]
    );
    const finalStatus = done ? 'approved' : 'partially_approved';
    const note = done ? null : `Step ${newStep} approved \u2014 awaiting next approver`;
    await updateOriginalMessage(slackToken, channelId, messageTs,
      outcomeBlocks(finalStatus, reqRow.title, actor.name, note),
      `${done ? 'Approved' : 'Step approved'}: ${reqRow.title}`);
    return { status: 200, body: {} };
  }

  if (actionType === 'reject') {
    if (!['pending', 'conditionally_approved_info_added'].includes(reqRow.status)) {
      return { status: 200, body: { replace_original: false, response_type: 'ephemeral',
        text: `\u26a0\ufe0f Can't reject \u2014 request is currently *${reqRow.status}*.` } };
    }
    await openModal(slackToken, payload.trigger_id, rejectModal(requestId, channelId, messageTs, reqRow.title));
    return { status: 200, body: {} };
  }

  if (actionType === 'info') {
    if (!['pending', 'conditionally_approved_info_added'].includes(reqRow.status)) {
      return { status: 200, body: { replace_original: false, response_type: 'ephemeral',
        text: `\u26a0\ufe0f Can't request info \u2014 request is currently *${reqRow.status}*.` } };
    }
    await openModal(slackToken, payload.trigger_id, moreInfoModal(requestId, channelId, messageTs, reqRow.title));
    return { status: 200, body: {} };
  }

  return { status: 400, body: { error: 'unknown action type' } };
}

async function handleViewSubmission(payload, pool, slackToken) {
  const view = payload.view;
  const slackUserId = payload.user?.id;
  if (!AUTHORIZED_SLACK_USERS.has(slackUserId)) {
    return { status: 200, body: { response_action: 'errors', errors: { reason_block: 'You are not authorized.' } } };
  }
  let meta;
  try { meta = JSON.parse(view.private_metadata || '{}'); } catch { meta = {}; }
  const { request_id, channel_id, message_ts, title } = meta;
  if (!request_id) return { status: 200, body: { response_action: 'clear' } };

  const actor = await resolveActor(pool, slackUserId);
  const today = new Date().toISOString().slice(0, 10);
  const values = view.state?.values || {};

  if (view.callback_id === 'spend_reject_modal') {
    const reason = values.reason_block?.reason_input?.value || '';
    if (!reason.trim()) {
      return { status: 200, body: { response_action: 'errors', errors: { reason_block: 'Reason is required.' } } };
    }
    await pool.query(
      `UPDATE af_requests SET status = 'rejected', rejection_note = $1, rejected_by = $2,
                                rejected_at = $3, updated_at = NOW()
       WHERE id = $4`,
      [reason, actor.id, today, request_id]
    );
    await pool.query(
      `INSERT INTO af_audit_log (action, detail, request_id, user_id, user_name)
       VALUES ('Request rejected (via Slack)', $1, $2, $3, $4)`,
      [`"${title || request_id}" rejected by ${actor.name} \u2014 ${reason}`, request_id, actor.id, actor.name]
    );
    await updateOriginalMessage(slackToken, channel_id, message_ts,
      outcomeBlocks('rejected', title, actor.name, reason),
      `Rejected: ${title}`);
    return { status: 200, body: { response_action: 'clear' } };
  }

  if (view.callback_id === 'spend_more_info_modal') {
    const question = values.question_block?.question_input?.value || '';
    if (!question.trim()) {
      return { status: 200, body: { response_action: 'errors', errors: { question_block: 'Please describe what info you need.' } } };
    }
    await pool.query(
      `UPDATE af_requests SET status = 'conditionally_approved', conditional_note = $1,
                                conditional_by = $2, conditional_at = $3, updated_at = NOW()
       WHERE id = $4`,
      [question, actor.id, today, request_id]
    );
    await pool.query(
      `INSERT INTO af_audit_log (action, detail, request_id, user_id, user_name)
       VALUES ('Additional info requested (via Slack)', $1, $2, $3, $4)`,
      [`"${title || request_id}" \u2014 ${question}`, request_id, actor.id, actor.name]
    );
    await updateOriginalMessage(slackToken, channel_id, message_ts,
      outcomeBlocks('conditionally_approved', title, actor.name, question),
      `More info requested: ${title}`);
    return { status: 200, body: { response_action: 'clear' } };
  }

  return { status: 200, body: { response_action: 'clear' } };
}

module.exports = function(app, { pool }) {
  // Use express.raw specifically for this route since we need byte-perfect body for signature verify.
  app.post('/slack-interactivity', express.raw({ type: '*/*', limit: '5mb' }), async (req, res) => {
    try {
      const rawBody = req.body.toString('utf8');
      const ok = verifySlackSig(rawBody, req.headers);
      if (!ok) return res.status(401).json({ error: 'invalid signature' });

      const params = new URLSearchParams(rawBody);
      const payloadStr = params.get('payload');
      if (!payloadStr) return res.status(400).json({ error: 'no payload' });

      const payload = JSON.parse(payloadStr);
      const slackToken = process.env.SLACK_BOT_TOKEN;

      let result;
      if (payload.type === 'block_actions') {
        result = await handleBlockActions(payload, pool, slackToken);
      } else if (payload.type === 'view_submission') {
        result = await handleViewSubmission(payload, pool, slackToken);
      } else {
        return res.status(200).json({ error: 'unsupported payload type' });
      }
      res.status(result.status).json(result.body);
    } catch (e) {
      console.error('slack-interactivity error:', e);
      res.status(500).json({ error: String(e) });
    }
  });
};
