
// POST /calendar-manager — port of supabase/functions/calendar-manager
// 4 actions: create, rsvp, find-times, book. Uses ?action= query string + JSON body.

module.exports = function(app, { requireAuth, pool }) {
  app.post('/calendar-manager', requireAuth, async (req, res) => {
    try {
      const action = req.query.action;
      const body = req.body || {};

      const fbSub = req.firebase?.sub;
      let userId = null;
      if (fbSub) {
        const { rows } = await pool.query(`SELECT id FROM profiles WHERE firebase_uid = $1 LIMIT 1`, [fbSub]);
        if (rows[0]) userId = rows[0].id;
      }
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      let result = {};

      switch (action) {
        case 'create': {
          const {
            org_id, calendar_id, title, description, location,
            start_at, end_at, all_day, timezone, event_type, has_video_call,
            attendee_ids, external_attendees, recurrence_rule, recurrence_end,
            project_id, team_id, objective_id, reminders, visibility,
          } = body;
          if (!org_id || !title || !start_at || !end_at) {
            return res.status(400).json({ success: false, error: 'org_id, title, start_at, end_at required' });
          }
          let calId = calendar_id;
          if (!calId) {
            const { rows: dc } = await pool.query(
              `SELECT id FROM calendars WHERE org_id = $1 AND owner_id = $2 AND is_default = true LIMIT 1`,
              [org_id, userId]);
            calId = dc[0]?.id;
            if (!calId) {
              const { rows: nc } = await pool.query(
                `INSERT INTO calendars (org_id, name, calendar_type, owner_id, is_default, created_by)
                 VALUES ($1, 'My Calendar', 'personal', $2, true, $2) RETURNING id`, [org_id, userId]);
              calId = nc[0]?.id;
            }
          }
          const { rows: evRows } = await pool.query(
            `INSERT INTO calendar_events
             (org_id, calendar_id, title, description, location, start_at, end_at, all_day,
              timezone, event_type, has_video_call, is_recurring, recurrence_rule, recurrence_end,
              project_id, team_id, objective_id, organizer_id, reminders, visibility)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
             RETURNING *`,
            [org_id, calId, title, description,
             has_video_call ? 'Helm Video Call' : location,
             start_at, end_at, all_day || false, timezone || 'UTC',
             event_type || 'meeting', has_video_call || false,
             !!recurrence_rule, recurrence_rule, recurrence_end,
             project_id, team_id, objective_id, userId,
             JSON.stringify(reminders || [{ type: 'notification', minutes_before: 10 }]),
             visibility || 'default']);
          const event = evRows[0];

          let roomId = null;
          if (event.call_id) {
            const { rows } = await pool.query(`SELECT room_id FROM calls WHERE id = $1 LIMIT 1`, [event.call_id]);
            roomId = rows[0]?.room_id;
          }

          await pool.query(
            `INSERT INTO event_attendees (event_id, user_id, rsvp_status, is_organizer, attendee_role)
             VALUES ($1, $2, 'accepted', true, 'required')`, [event.id, userId]);

          if (attendee_ids?.length) {
            for (const uid of attendee_ids) {
              await pool.query(
                `INSERT INTO event_attendees (event_id, user_id, rsvp_status, attendee_role)
                 VALUES ($1, $2, 'pending', 'required')`, [event.id, uid]);
            }
            const { rows: org } = await pool.query(`SELECT display_name FROM profiles WHERE id = $1 LIMIT 1`, [userId]);
            for (const uid of attendee_ids) {
              await pool.query(
                `INSERT INTO notifications (org_id, user_id, type, title, body, entity_type, entity_id, actor_id, metadata)
                 VALUES ($1, $2, 'calendar_invite', $3, $4, 'calendar_event', $5, $6, $7)`,
                [org_id, uid,
                 `${org[0]?.display_name} invited you to: ${title}`,
                 `${new Date(start_at).toLocaleString()}${has_video_call ? ' (Video Call)' : ''}`,
                 event.id, userId,
                 JSON.stringify({ event_type, has_video_call, video_link: event.video_link, start_at, end_at })]);
            }
            if (event.call_id) {
              for (const uid of attendee_ids) {
                await pool.query(
                  `INSERT INTO call_participants (call_id, user_id, status, role)
                   VALUES ($1, $2, 'invited', 'participant')`, [event.call_id, uid]);
              }
            }
          }

          if (external_attendees?.length) {
            for (const att of external_attendees) {
              await pool.query(
                `INSERT INTO event_attendees (event_id, email, display_name, rsvp_status, attendee_role)
                 VALUES ($1, $2, $3, 'pending', 'required')`,
                [event.id, att.email, att.name || null]);
            }
          }

          result = {
            event_id: event.id, calendar_id: calId,
            video_link: event.video_link, call_id: event.call_id, room_id: roomId,
          };
          break;
        }

        case 'rsvp': {
          const { event_id, rsvp_status, comment } = body;
          if (!event_id || !rsvp_status) return res.status(400).json({ success: false, error: 'event_id and rsvp_status required' });
          if (!['accepted', 'declined', 'tentative'].includes(rsvp_status)) {
            return res.status(400).json({ success: false, error: 'Invalid RSVP status' });
          }
          await pool.query(
            `UPDATE event_attendees SET rsvp_status = $1, rsvp_at = NOW(), rsvp_comment = $2
             WHERE event_id = $3 AND user_id = $4`,
            [rsvp_status, comment || null, event_id, userId]);
          const { rows: evRows } = await pool.query(
            `SELECT organizer_id, title, org_id FROM calendar_events WHERE id = $1 LIMIT 1`, [event_id]);
          const event = evRows[0];
          if (event && event.organizer_id !== userId) {
            const { rows: rp } = await pool.query(`SELECT display_name FROM profiles WHERE id = $1 LIMIT 1`, [userId]);
            await pool.query(
              `INSERT INTO notifications (org_id, user_id, type, title, entity_type, entity_id, actor_id)
               VALUES ($1, $2, 'calendar_rsvp', $3, 'calendar_event', $4, $5)`,
              [event.org_id, event.organizer_id,
               `${rp[0]?.display_name} ${rsvp_status} your event: ${event.title}`,
               event_id, userId]);
          }
          result = { event_id, rsvp_status };
          break;
        }

        case 'find-times': {
          const { org_id, user_ids, range_start, range_end, duration_minutes = 30 } = body;
          if (!org_id || !user_ids?.length || !range_start || !range_end) {
            return res.status(400).json({ success: false, error: 'org_id, user_ids, range_start, range_end required' });
          }
          const allSlots = new Map();
          for (const uid of user_ids) {
            const { rows: slots } = await pool.query(
              `SELECT * FROM get_user_availability($1, $2, $3, $4, $5)`,
              [uid, org_id, range_start, range_end, duration_minutes]);
            for (const slot of slots) {
              const key = slot.slot_start;
              allSlots.set(key, (allSlots.get(key) || 0) + 1);
            }
          }
          const commonSlots = Array.from(allSlots.entries())
            .filter(([_, count]) => count === user_ids.length)
            .map(([start]) => ({ start, end: new Date(new Date(start).getTime() + duration_minutes * 60000).toISOString() }))
            .slice(0, 20);
          result = { available_slots: commonSlots, total_found: commonSlots.length, participants_checked: user_ids.length };
          break;
        }

        case 'book': {
          const { scheduling_link_slug, org_id, start_at, booker_name, booker_email, answers } = body;
          if (!scheduling_link_slug || !org_id || !start_at) {
            return res.status(400).json({ success: false, error: 'scheduling_link_slug, org_id, start_at required' });
          }
          const { rows: lr } = await pool.query(
            `SELECT * FROM scheduling_links WHERE org_id = $1 AND slug = $2 AND is_active = true LIMIT 1`,
            [org_id, scheduling_link_slug]);
          const link = lr[0];
          if (!link) return res.status(400).json({ success: false, error: 'Scheduling link not found or inactive' });

          const endTime = new Date(new Date(start_at).getTime() + link.duration_minutes * 60000).toISOString();
          const { rows: ocr } = await pool.query(
            `SELECT id FROM calendars WHERE owner_id = $1 AND org_id = $2 AND is_default = true LIMIT 1`,
            [link.owner_id, org_id]);
          if (!ocr[0]) return res.status(400).json({ success: false, error: 'Calendar not found' });

          const { rows: evRows } = await pool.query(
            `INSERT INTO calendar_events
             (org_id, calendar_id, title, description, start_at, end_at, timezone, event_type,
              has_video_call, organizer_id, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'meeting', $8, $9, $10) RETURNING *`,
            [org_id, ocr[0].id,
             `${link.title} with ${booker_name || booker_email || 'Guest'}`,
             answers ? `Booking responses:\n${JSON.stringify(answers, null, 2)}` : null,
             start_at, endTime, link.timezone, link.include_video_call, link.owner_id,
             JSON.stringify({ scheduling_link_id: link.id, booker_name, booker_email, answers })]);
          const event = evRows[0];

          await pool.query(
            `INSERT INTO event_attendees (event_id, user_id, rsvp_status, is_organizer)
             VALUES ($1, $2, 'accepted', true)`, [event.id, link.owner_id]);
          if (booker_email) {
            await pool.query(
              `INSERT INTO event_attendees (event_id, email, display_name, rsvp_status)
               VALUES ($1, $2, $3, 'accepted')`,
              [event.id, booker_email, booker_name || null]);
          }
          await pool.query(
            `INSERT INTO notifications (org_id, user_id, type, title, body, entity_type, entity_id)
             VALUES ($1, $2, 'booking_confirmed', $3, $4, 'calendar_event', $5)`,
            [org_id, link.owner_id,
             `New booking: ${booker_name || booker_email || 'Guest'}`,
             `${link.title} at ${new Date(start_at).toLocaleString()}`, event.id]);

          result = { event_id: event.id, video_link: event.video_link, start_at, end_at: endTime, confirmed: !link.require_approval };
          break;
        }

        default:
          return res.status(400).json({ success: false, error: 'Invalid action. Use ?action=create|rsvp|find-times|book' });
      }

      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err?.message || String(err) });
    }
  });
};
