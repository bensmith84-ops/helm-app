
// POST /send-invite — port of supabase/functions/send-invite
// Pure DB: saves attendees + generates iCal for the caller to send via email.
// No auth admin calls. Resend/SendGrid delivery is up to the caller.

function generateICS(event, attendees, orgName, orgEmail) {
  const fmt = (d) => {
    const dt = new Date(d);
    return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };
  const uid = event.id + '@helm.io';
  const now = fmt(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Helm//Calendar//EN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmt(event.start_at)}`,
    event.end_at ? `DTEND:${fmt(event.end_at)}` : '',
    `SUMMARY:${(event.title || '').replace(/[\n]/g, ' ')}`,
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : '',
    event.location ? `LOCATION:${event.location}` : '',
    `ORGANIZER;CN=${orgName}:mailto:${orgEmail}`,
    ...attendees.map(a => `ATTENDEE;CN=${a.name || a.email};RSVP=TRUE:mailto:${a.email}`),
    'STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

module.exports = function(app, { pool }) {
  app.post('/send-invite', async (req, res) => {
    try {
      const { event_id, attendees } = req.body || {};
      if (!event_id || !attendees?.length) {
        return res.status(400).json({ error: 'event_id and attendees required' });
      }

      const { rows: evRows } = await pool.query(
        `SELECT * FROM calendar_events WHERE id = $1 LIMIT 1`, [event_id]
      );
      const event = evRows[0];
      if (!event) return res.status(404).json({ error: 'Event not found' });

      let orgName = 'Helm User';
      let orgEmail = 'noreply@helm.io';
      if (event.organizer_id) {
        const { rows: profRows } = await pool.query(
          `SELECT display_name, email FROM profiles WHERE id = $1 LIMIT 1`, [event.organizer_id]
        );
        if (profRows[0]) {
          orgName = profRows[0].display_name || orgName;
          orgEmail = profRows[0].email || orgEmail;
        }
      }

      const saved = [];
      for (const att of attendees) {
        try {
          const { rows } = await pool.query(
            `INSERT INTO event_attendees
              (event_id, email, display_name, user_id, rsvp_status, attendee_role, notification_sent)
             VALUES ($1, $2, $3, $4, 'pending', 'attendee', true)
             RETURNING *`,
            [event_id, att.email, att.name || att.email.split('@')[0], att.user_id || null]
          );
          if (rows[0]) saved.push(rows[0]);
        } catch {} // ignore dup conflicts
      }

      const ics = generateICS(event, attendees, orgName, orgEmail);

      res.json({
        success: true, ics,
        attendees_saved: saved.length,
        message: 'Attendees saved. Email delivery requires Resend/SendGrid setup in Helm settings.',
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
