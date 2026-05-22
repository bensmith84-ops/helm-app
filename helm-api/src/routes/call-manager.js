
// POST /call-manager?action=start-huddle|call-user|join|leave|end|toggle-recording|respond|get-token
// Port of supabase/functions/call-manager. LiveKit AccessToken JWT + Egress recording.
const { AccessToken } = require('livekit-server-sdk');

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_HOST = LIVEKIT_URL.replace(/^wss?:\/\//, 'https://').replace(/\/$/, '');

async function createParticipantToken(roomName, identity, name, isHost) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity, name, ttl: '6h',
  });
  at.addGrant({
    roomJoin: true, room: roomName,
    canPublish: true, canSubscribe: true, canPublishData: true,
    roomAdmin: isHost, roomRecord: isHost,
  });
  return await at.toJwt();
}

async function egressAdminToken(roomName) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { ttl: '1m' });
  at.addGrant({ roomRecord: true, room: roomName });
  return await at.toJwt();
}

module.exports = function(app, { pool, requireAuth }) {
  app.post('/call-manager', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.helm_user?.uid;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      // Look up display name
      const { rows: profRows } = await pool.query(
        `SELECT display_name, avatar_url, email FROM profiles WHERE id = $1 LIMIT 1`, [userId]
      );
      const displayName = profRows[0]?.display_name || profRows[0]?.email || 'User';

      const action = req.query.action;
      const body = req.body || {};
      let result = {};

      if (action === 'start-huddle') {
        const { org_id, channel_id, media_mode = 'audio', title } = body;
        if (!org_id) return res.status(400).json({ success: false, error: 'org_id is required' });

        if (channel_id) {
          const { rows: actRows } = await pool.query(
            `SELECT id, room_id FROM calls
             WHERE channel_id = $1 AND call_type = 'huddle' AND status IN ('waiting','active') LIMIT 1`,
            [channel_id]
          );
          if (actRows[0]) {
            await pool.query(
              `INSERT INTO call_participants (call_id, user_id, status, joined_at, role)
               VALUES ($1, $2, 'joined', NOW(), 'participant')
               ON CONFLICT (call_id, user_id) DO UPDATE
               SET status = 'joined', joined_at = NOW()`,
              [actRows[0].id, userId]
            );
            const token = await createParticipantToken(actRows[0].room_id, userId, displayName, false);
            return res.json({
              success: true,
              call_id: actRows[0].id, room_id: actRows[0].room_id,
              action: 'joined_existing', livekit_url: LIVEKIT_URL, livekit_token: token,
              join_url: `https://helm.app/call/${actRows[0].room_id}`,
            });
          }
        }

        const { rows: callRows } = await pool.query(
          `INSERT INTO calls
            (org_id, title, call_type, status, media_mode, source_type, source_id, channel_id, started_at, created_by)
           VALUES ($1, $2, 'huddle', 'active', $3, $4, $5, $5, NOW(), $6)
           RETURNING *`,
          [org_id, title || 'Huddle', media_mode,
           channel_id ? 'channel' : 'ad_hoc', channel_id, userId]
        );
        const call = callRows[0];

        await pool.query(
          `INSERT INTO call_participants (call_id, user_id, status, joined_at, role)
           VALUES ($1, $2, 'joined', NOW(), 'host')`,
          [call.id, userId]
        );

        const hostToken = await createParticipantToken(call.room_id, userId, displayName, true);

        if (channel_id) {
          await pool.query(
            `INSERT INTO messages
              (channel_id, author_id, content, content_format, is_system, metadata)
             VALUES ($1, $2, $3, 'markdown', true, $4)`,
            [channel_id, userId, `\u{1F4DE} ${displayName} started a huddle`,
             JSON.stringify({ type: 'huddle_started', call_id: call.id, room_id: call.room_id })]
          );
        }

        result = {
          call_id: call.id, room_id: call.room_id,
          action: 'created', livekit_url: LIVEKIT_URL, livekit_token: hostToken,
          join_url: `https://helm.app/call/${call.room_id}`,
        };
      } else if (action === 'call-user') {
        const { org_id, target_user_ids, media_mode = 'video', title } = body;
        if (!org_id || !target_user_ids?.length) {
          return res.status(400).json({ success: false, error: 'org_id and target_user_ids are required' });
        }

        const { rows: callRows } = await pool.query(
          `INSERT INTO calls
            (org_id, title, call_type, status, media_mode, source_type, created_by)
           VALUES ($1, $2, 'instant', 'ringing', $3, 'direct', $4)
           RETURNING *`,
          [org_id, title || (target_user_ids.length === 1 ? 'Call' : 'Group Call'), media_mode, userId]
        );
        const call = callRows[0];

        await pool.query(
          `INSERT INTO call_participants (call_id, user_id, status, joined_at, role)
           VALUES ($1, $2, 'joined', NOW(), 'host')`,
          [call.id, userId]
        );

        const hostToken = await createParticipantToken(call.room_id, userId, displayName, true);

        for (const uid of target_user_ids) {
          await pool.query(
            `INSERT INTO call_participants (call_id, user_id, status, role)
             VALUES ($1, $2, 'ringing', 'participant')`,
            [call.id, uid]
          );
          await pool.query(
            `INSERT INTO notifications
              (org_id, user_id, type, title, body, entity_type, entity_id, actor_id, metadata)
             VALUES ($1, $2, 'incoming_call', $3, $4, 'call', $5, $6, $7)`,
            [org_id, uid, `${displayName} is calling you`,
             media_mode === 'video' ? 'Video call' : 'Audio call',
             call.id, userId,
             JSON.stringify({ room_id: call.room_id, media_mode, call_type: 'instant', livekit_url: LIVEKIT_URL })]
          );
        }

        result = {
          call_id: call.id, room_id: call.room_id,
          livekit_url: LIVEKIT_URL, livekit_token: hostToken,
          join_url: `https://helm.app/call/${call.room_id}`,
          ringing: target_user_ids,
        };
      } else if (action === 'join') {
        const { call_id } = body;
        if (!call_id) return res.status(400).json({ success: false, error: 'call_id is required' });

        const { rows: cRows } = await pool.query(`SELECT * FROM calls WHERE id = $1 LIMIT 1`, [call_id]);
        const call = cRows[0];
        if (!call) return res.status(400).json({ success: false, error: 'Call not found' });
        if (call.status === 'ended') return res.status(400).json({ success: false, error: 'Call has ended' });

        if (call.require_admission) {
          const { rows: ex } = await pool.query(
            `SELECT status FROM call_participants WHERE call_id = $1 AND user_id = $2 LIMIT 1`,
            [call_id, userId]
          );
          if (!ex[0] || ex[0].status === 'invited') {
            await pool.query(
              `INSERT INTO call_participants (call_id, user_id, status)
               VALUES ($1, $2, 'invited')
               ON CONFLICT (call_id, user_id) DO UPDATE SET status = 'invited'`,
              [call_id, userId]
            );
            return res.json({ success: true, status: 'waiting_in_lobby', call_id, room_id: call.room_id });
          }
        }

        const { rows: prRows } = await pool.query(
          `SELECT role FROM call_participants WHERE call_id = $1 AND user_id = $2 LIMIT 1`,
          [call_id, userId]
        );
        const existingRole = prRows[0]?.role;
        const isHost = existingRole === 'host' || existingRole === 'co_host';

        await pool.query(
          `INSERT INTO call_participants (call_id, user_id, status, joined_at, role)
           VALUES ($1, $2, 'joined', NOW(), $3)
           ON CONFLICT (call_id, user_id) DO UPDATE
           SET status = 'joined', joined_at = NOW()`,
          [call_id, userId, existingRole || 'participant']
        );

        if (call.status !== 'active') {
          await pool.query(
            `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW()) WHERE id = $1`,
            [call_id]
          );
        }

        const joinToken = await createParticipantToken(call.room_id, userId, displayName, isHost);
        result = {
          call_id, room_id: call.room_id, status: 'joined',
          livekit_url: LIVEKIT_URL, livekit_token: joinToken,
          join_url: `https://helm.app/call/${call.room_id}`,
        };
      } else if (action === 'leave') {
        const { call_id } = body;
        if (!call_id) return res.status(400).json({ success: false, error: 'call_id is required' });

        await pool.query(
          `UPDATE call_participants SET status = 'left', left_at = NOW()
           WHERE call_id = $1 AND user_id = $2`,
          [call_id, userId]
        );
        const { rows: ctRows } = await pool.query(
          `SELECT COUNT(*)::int AS count FROM call_participants
           WHERE call_id = $1 AND status = 'joined'`,
          [call_id]
        );
        const remaining = ctRows[0].count;
        if (remaining === 0) {
          await pool.query(`UPDATE calls SET status = 'ended' WHERE id = $1`, [call_id]);
        }
        result = { call_id, status: 'left', call_ended: remaining === 0 };
      } else if (action === 'end') {
        const { call_id } = body;
        if (!call_id) return res.status(400).json({ success: false, error: 'call_id is required' });

        const { rows: pr } = await pool.query(
          `SELECT role FROM call_participants WHERE call_id = $1 AND user_id = $2 LIMIT 1`,
          [call_id, userId]
        );
        if (!pr[0] || !['host', 'co_host'].includes(pr[0].role)) {
          return res.status(400).json({ success: false, error: 'Only hosts can end a call for everyone' });
        }

        await pool.query(
          `UPDATE call_participants SET status = 'left', left_at = NOW()
           WHERE call_id = $1 AND status = 'joined'`,
          [call_id]
        );
        await pool.query(`UPDATE calls SET status = 'ended', ended_at = NOW() WHERE id = $1`, [call_id]);

        const { rows: callRows } = await pool.query(
          `SELECT channel_id, duration_seconds FROM calls WHERE id = $1 LIMIT 1`, [call_id]
        );
        if (callRows[0]?.channel_id) {
          const mins = Math.round((callRows[0].duration_seconds || 0) / 60);
          await pool.query(
            `INSERT INTO messages
              (channel_id, author_id, content, content_format, is_system, metadata)
             VALUES ($1, $2, $3, 'markdown', true, $4)`,
            [callRows[0].channel_id, userId,
             `\u{1F4DE} Huddle ended${mins > 0 ? ` (${mins} min)` : ''}`,
             JSON.stringify({ type: 'huddle_ended', call_id })]
          );
        }
        result = { call_id, status: 'ended' };
      } else if (action === 'toggle-recording') {
        const { call_id, enable } = body;
        if (!call_id) return res.status(400).json({ success: false, error: 'call_id is required' });

        const { rows: pr } = await pool.query(
          `SELECT role FROM call_participants WHERE call_id = $1 AND user_id = $2 LIMIT 1`,
          [call_id, userId]
        );
        if (!pr[0] || !['host', 'co_host'].includes(pr[0].role)) {
          return res.status(400).json({ success: false, error: 'Only hosts can manage recording' });
        }

        const { rows: cr } = await pool.query(
          `SELECT org_id, room_id FROM calls WHERE id = $1 LIMIT 1`, [call_id]
        );
        const call = cr[0];
        if (!call) return res.status(400).json({ success: false, error: 'Call not found' });

        if (enable) {
          let egressId = null;
          try {
            const adminToken = await egressAdminToken(call.room_id);
            const egressResp = await fetch(
              `${LIVEKIT_HOST}/twirp/livekit.Egress/StartRoomCompositeEgress`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
                body: JSON.stringify({
                  room_name: call.room_id,
                  file: { file_type: 'MP4', filepath: `recordings/${call.org_id}/${call_id}/{room_name}-{time}.mp4` },
                }),
              }
            );
            if (egressResp.ok) {
              const egressData = await egressResp.json();
              egressId = egressData?.egress_id;
            }
          } catch {}

          const { rows: recRows } = await pool.query(
            `INSERT INTO call_recordings
              (call_id, org_id, status, recording_type, started_at, recorded_by, metadata)
             VALUES ($1, $2, 'recording', 'combined', NOW(), $3, $4) RETURNING id`,
            [call_id, call.org_id, userId, JSON.stringify({ egress_id: egressId })]
          );
          await pool.query(
            `UPDATE calls SET is_recording_enabled = true, recording_started_at = NOW() WHERE id = $1`,
            [call_id]
          );
          result = { call_id, recording_id: recRows[0].id, recording: true, egress_id: egressId };
        } else {
          const { rows: activeRecRows } = await pool.query(
            `SELECT id, metadata FROM call_recordings
             WHERE call_id = $1 AND status = 'recording' LIMIT 1`,
            [call_id]
          );
          const activeRec = activeRecRows[0];
          if (activeRec?.metadata?.egress_id) {
            try {
              const adminToken = await egressAdminToken('');
              await fetch(
                `${LIVEKIT_HOST}/twirp/livekit.Egress/StopEgress`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
                  body: JSON.stringify({ egress_id: activeRec.metadata.egress_id }),
                }
              );
            } catch {}
          }
          await pool.query(
            `UPDATE call_recordings SET status = 'processing', ended_at = NOW()
             WHERE call_id = $1 AND status = 'recording'`,
            [call_id]
          );
          await pool.query(
            `UPDATE calls SET is_recording_enabled = false WHERE id = $1`, [call_id]
          );
          result = { call_id, recording: false };
        }
      } else if (action === 'respond') {
        const { call_id, response } = body;
        if (!call_id || !response) return res.status(400).json({ success: false, error: 'call_id and response required' });

        if (response === 'accept') {
          await pool.query(
            `UPDATE call_participants SET status = 'joined', joined_at = NOW()
             WHERE call_id = $1 AND user_id = $2`,
            [call_id, userId]
          );
          const { rows: cr } = await pool.query(
            `SELECT room_id, status FROM calls WHERE id = $1 LIMIT 1`, [call_id]
          );
          const call = cr[0];
          if (call?.status === 'ringing') {
            await pool.query(`UPDATE calls SET status = 'active', started_at = NOW() WHERE id = $1`, [call_id]);
          }
          const joinToken = await createParticipantToken(call.room_id, userId, displayName, false);
          result = { call_id, room_id: call?.room_id, status: 'joined',
            livekit_url: LIVEKIT_URL, livekit_token: joinToken };
        } else {
          await pool.query(
            `UPDATE call_participants SET status = 'declined'
             WHERE call_id = $1 AND user_id = $2`,
            [call_id, userId]
          );
          const { rows: rRows } = await pool.query(
            `SELECT COUNT(*)::int AS count FROM call_participants
             WHERE call_id = $1 AND status IN ('ringing','invited')`,
            [call_id]
          );
          if (rRows[0].count === 0) {
            await pool.query(`UPDATE calls SET status = 'ended' WHERE id = $1`, [call_id]);
          }
          result = { call_id, status: 'declined' };
        }
      } else if (action === 'get-token') {
        const { call_id } = body;
        if (!call_id) return res.status(400).json({ success: false, error: 'call_id is required' });

        const { rows: cr } = await pool.query(
          `SELECT room_id, status FROM calls WHERE id = $1 LIMIT 1`, [call_id]
        );
        const call = cr[0];
        if (!call || call.status === 'ended') return res.status(400).json({ success: false, error: 'Call not found or ended' });

        const { rows: pr } = await pool.query(
          `SELECT role, status FROM call_participants WHERE call_id = $1 AND user_id = $2 LIMIT 1`,
          [call_id, userId]
        );
        if (!pr[0] || pr[0].status !== 'joined') return res.status(400).json({ success: false, error: 'You are not in this call' });

        const isHost = pr[0].role === 'host' || pr[0].role === 'co_host';
        const token = await createParticipantToken(call.room_id, userId, displayName, isHost);
        result = { call_id, room_id: call.room_id, livekit_url: LIVEKIT_URL, livekit_token: token };
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use ?action=start-huddle|call-user|join|leave|end|toggle-recording|respond|get-token',
        });
      }

      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err?.message || String(err) });
    }
  });
};
