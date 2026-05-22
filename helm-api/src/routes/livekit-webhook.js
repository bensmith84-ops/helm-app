
// POST /livekit-webhook — port of supabase/functions/livekit-webhook
// 7 events: room_started/finished, participant_joined/left, track_published/unpublished, egress_started/ended.
// Verifies LiveKit webhook signature via WebhookReceiver.
const express = require('express');
const { WebhookReceiver } = require('livekit-server-sdk');

module.exports = function(app, { pool }) {
  const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
  const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
  const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  // Use express.raw — LiveKit sends application/webhook+json with sig in Authorization
  app.post('/livekit-webhook',
    express.raw({ type: '*/*', limit: '5mb' }),
    async (req, res) => {
      try {
        const rawBody = req.body?.toString('utf8') || '';
        const authHeader = req.headers['authorization'] || '';

        let event;
        try {
          event = await receiver.receive(rawBody, authHeader);
        } catch (verifyErr) {
          console.error('[livekit-webhook] verify failed:', verifyErr?.message);
          return res.status(401).send('Unauthorized');
        }

        const now = new Date().toISOString();

        switch (event.event) {
          case 'room_started': {
            const roomName = event.room?.name;
            if (!roomName) break;
            await pool.query(
              `UPDATE calls SET status = 'active', started_at = NOW(),
                                room_config = $1
               WHERE room_id = $2 AND status IN ('waiting','ringing')`,
              [JSON.stringify({
                sid: event.room?.sid,
                max_participants: event.room?.maxParticipants,
                creation_time: event.room?.creationTime,
              }), roomName]
            );
            break;
          }
          case 'room_finished': {
            const roomName = event.room?.name;
            if (!roomName) break;
            await pool.query(
              `UPDATE calls SET status = 'ended', ended_at = NOW()
               WHERE room_id = $1 AND status != 'ended'`,
              [roomName]
            );
            const { rows } = await pool.query(`SELECT id FROM calls WHERE room_id = $1 LIMIT 1`, [roomName]);
            if (rows[0]) {
              await pool.query(
                `UPDATE call_participants SET status = 'left', left_at = NOW()
                 WHERE call_id = $1 AND status = 'joined'`,
                [rows[0].id]
              );
            }
            break;
          }
          case 'participant_joined': {
            const roomName = event.room?.name;
            const identity = event.participant?.identity;
            if (!roomName || !identity) break;
            const { rows } = await pool.query(`SELECT id FROM calls WHERE room_id = $1 LIMIT 1`, [roomName]);
            if (rows[0]) {
              await pool.query(
                `INSERT INTO call_participants (call_id, user_id, status, joined_at)
                 VALUES ($1, $2, 'joined', NOW())
                 ON CONFLICT (call_id, user_id) DO UPDATE
                 SET status = 'joined', joined_at = NOW()`,
                [rows[0].id, identity]
              );
            }
            break;
          }
          case 'participant_left': {
            const roomName = event.room?.name;
            const identity = event.participant?.identity;
            if (!roomName || !identity) break;
            const { rows } = await pool.query(`SELECT id FROM calls WHERE room_id = $1 LIMIT 1`, [roomName]);
            if (rows[0]) {
              await pool.query(
                `UPDATE call_participants SET status = 'left', left_at = NOW()
                 WHERE call_id = $1 AND user_id = $2 AND status = 'joined'`,
                [rows[0].id, identity]
              );
            }
            break;
          }
          case 'track_published': {
            const roomName = event.room?.name;
            const identity = event.participant?.identity;
            const track = event.track;
            if (!roomName || !identity || !track) break;
            const { rows } = await pool.query(`SELECT id FROM calls WHERE room_id = $1 LIMIT 1`, [roomName]);
            if (rows[0]) {
              const updates = {};
              if (track.source === 'SCREEN_SHARE' || track.source === 'SCREEN_SHARE_AUDIO') updates.is_screen_sharing = true;
              else if (track.type === 'VIDEO') updates.is_video_on = true;
              else if (track.type === 'AUDIO') updates.is_muted = false;

              const keys = Object.keys(updates);
              if (keys.length > 0) {
                const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
                const params = keys.map(k => updates[k]);
                params.push(rows[0].id, identity);
                await pool.query(
                  `UPDATE call_participants SET ${setSql}
                   WHERE call_id = $${params.length - 1} AND user_id = $${params.length}`,
                  params
                );
              }
            }
            break;
          }
          case 'track_unpublished': {
            const roomName = event.room?.name;
            const identity = event.participant?.identity;
            const track = event.track;
            if (!roomName || !identity || !track) break;
            const { rows } = await pool.query(`SELECT id FROM calls WHERE room_id = $1 LIMIT 1`, [roomName]);
            if (rows[0]) {
              const updates = {};
              if (track.source === 'SCREEN_SHARE' || track.source === 'SCREEN_SHARE_AUDIO') updates.is_screen_sharing = false;
              else if (track.type === 'VIDEO') updates.is_video_on = false;
              else if (track.type === 'AUDIO') updates.is_muted = true;

              const keys = Object.keys(updates);
              if (keys.length > 0) {
                const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
                const params = keys.map(k => updates[k]);
                params.push(rows[0].id, identity);
                await pool.query(
                  `UPDATE call_participants SET ${setSql}
                   WHERE call_id = $${params.length - 1} AND user_id = $${params.length}`,
                  params
                );
              }
            }
            break;
          }
          case 'egress_ended': {
            const egressInfo = event.egressInfo;
            if (!egressInfo) break;
            const roomName = egressInfo.roomName;
            const egressId = egressInfo.egressId;
            const { rows: cRows } = await pool.query(
              `SELECT id, org_id FROM calls WHERE room_id = $1 LIMIT 1`, [roomName]
            );
            if (!cRows[0]) break;
            const fileResults = egressInfo.fileResults || [];
            const firstFile = fileResults[0];
            const status = egressInfo.status === 'EGRESS_COMPLETE' ? 'ready' : 'failed';

            await pool.query(
              `UPDATE call_recordings
               SET status = $1, ended_at = NOW(),
                   file_path = $2, file_size_bytes = $3, duration_seconds = $4, file_url = $5
               WHERE call_id = $6 AND metadata->>'egress_id' = $7`,
              [status,
               firstFile?.filename || null,
               firstFile?.size ? parseInt(firstFile.size) : null,
               firstFile?.duration ? Math.round(parseInt(firstFile.duration) / 1000000000) : null,
               firstFile?.location || null,
               cRows[0].id, egressId]
            );

            if (status === 'ready') {
              await pool.query(
                `INSERT INTO call_transcripts
                  (call_id, org_id, status, language, model_used)
                 VALUES ($1, $2, 'processing', 'en', 'whisper-large-v3')`,
                [cRows[0].id, cRows[0].org_id]
              );
            }
            break;
          }
          case 'egress_started':
            // no-op
            break;
          default:
            console.log(`[livekit-webhook] unhandled: ${event.event}`);
        }

        res.json({ received: true });
      } catch (err) {
        console.error('[livekit-webhook] error:', err?.message);
        res.status(500).json({ error: err?.message || String(err) });
      }
    }
  );
};
