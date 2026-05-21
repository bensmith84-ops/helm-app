
function parseIcal(text) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0].replace(/\r?\n[ \t]/g, '');
    const get = (key) => {
      const regex = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[;:](.*)$', 'm');
      const m = block.match(regex);
      return m ? m[1].replace(/\\n/g, '\n').replace(/\\,/g, ',').trim() : null;
    };
    const parseDate = (val) => {
      if (!val) return null;
      const clean = val.includes(':') ? val.split(':').pop() : val;
      if (clean.length === 8) return new Date(clean.slice(0,4) + '-' + clean.slice(4,6) + '-' + clean.slice(6,8) + 'T00:00:00Z');
      const y = clean.slice(0,4), mo = clean.slice(4,6), d = clean.slice(6,8);
      const h = clean.slice(9,11) || '00', mi = clean.slice(11,13) || '00', s = clean.slice(13,15) || '00';
      return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
    };
    const summary = get('SUMMARY'), dtStart = get('DTSTART'), dtEnd = get('DTEND');
    const location = get('LOCATION'), description = get('DESCRIPTION'), uid = get('UID');
    if (!summary || !dtStart) continue;
    const start = parseDate(dtStart), end = dtEnd ? parseDate(dtEnd) : null;
    if (!start || isNaN(start.getTime())) continue;
    const urlP = /(https?:\/\/[^\s<>"]+(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)[^\s<>"]*)/i;
    const vl = (description || '').match(urlP)?.[1] || (location || '').match(urlP)?.[1] || null;
    const allDay = !dtStart.includes('T');
    events.push({
      uid, title: summary, start: start.toISOString(), end: end?.toISOString() || null,
      location, description, video_link: vl, all_day: allDay,
    });
  }
  return events;
}

module.exports = function(app, { pool }) {
  const handler = async (req, res) => {
    try {
      const src = { ...(req.query || {}), ...(req.body || {}) };
      const mode = src.mode || 'fetch';
      const icalUrl = src.url;
      const calendarId = src.calendar_id;
      const orgId = src.org_id;
      const userId = src.user_id;

      if (!icalUrl) return res.status(400).json({ error: "Missing 'url' parameter" });

      let parsedUrl;
      try { parsedUrl = new URL(icalUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
      if (!parsedUrl.protocol.startsWith('http')) {
        return res.status(400).json({ error: 'Only HTTP/HTTPS URLs' });
      }

      const upstream = await fetch(icalUrl, {
        headers: { 'User-Agent': 'Helm Calendar Sync/1.0', 'Accept': 'text/calendar, text/plain, */*' },
        redirect: 'follow',
      });
      if (!upstream.ok) {
        return res.status(502).json({ error: `Upstream ${upstream.status}: ${upstream.statusText}` });
      }
      const text = await upstream.text();
      if (!text.includes('BEGIN:VCALENDAR')) {
        return res.status(422).json({ error: 'Not valid iCalendar data' });
      }

      if (mode === 'sync' && calendarId && orgId && userId) {
        const events = parseIcal(text);

        await pool.query(
          `DELETE FROM calendar_events WHERE calendar_id = $1 AND external_event_id IS NOT NULL`,
          [calendarId]
        );

        for (let i = 0; i < events.length; i += 100) {
          const batch = events.slice(i, i + 100);
          const values = [];
          const params = [];
          let pi = 1;
          for (const e of batch) {
            values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, 'ical', $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, 'confirmed', 'meeting')`);
            params.push(
              orgId, userId, calendarId, e.uid || `${e.title}-${e.start}`,
              e.title, e.description || null, e.start, e.end,
              e.all_day, e.location || null, e.video_link || null, !!e.video_link
            );
          }
          if (batch.length > 0) {
            await pool.query(
              `INSERT INTO calendar_events (org_id, organizer_id, calendar_id, external_event_id, external_provider, title, description, start_at, end_at, all_day, location, video_link, has_video_call, status, event_type)
               VALUES ${values.join(', ')}`,
              params
            );
          }
        }

        await pool.query(`UPDATE calendars SET last_synced_at = NOW() WHERE id = $1`, [calendarId]);

        return res.json({ success: true, events_synced: events.length, events_parsed: events.length });
      }

      res.set('Content-Type', 'text/calendar; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      return res.send(text);
    } catch (err) {
      res.status(500).json({ error: 'Failed: ' + (err?.message || String(err)) });
    }
  };
  app.get('/ical-proxy', handler);
  app.post('/ical-proxy', handler);
};
