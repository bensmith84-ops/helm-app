-- Remove the Helm "calls" created by the iCal-import bug (fixed in 018) and
-- undo its damage to imported events. Only touches calls that came from a
-- calendar event, never started, and whose event is gone or was imported.
-- Imported events lose the fake helm.app/call link; clearing last_synced_at
-- makes the next Home load re-import them with their real meeting links.
UPDATE calendar_events
   SET call_id = NULL,
       video_link = CASE WHEN video_link LIKE 'https://helm.app/call/%' THEN NULL ELSE video_link END
 WHERE external_event_id IS NOT NULL AND call_id IS NOT NULL;

DELETE FROM calls c
 WHERE c.source_type = 'calendar_event'
   AND c.started_at IS NULL
   AND c.ended_at IS NULL
   AND (c.calendar_event_id IS NULL
        OR EXISTS (SELECT 1 FROM calendar_events e WHERE e.id = c.calendar_event_id AND e.external_event_id IS NOT NULL))
   AND NOT EXISTS (SELECT 1 FROM calendar_events e WHERE e.call_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM call_recordings r WHERE r.call_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM call_transcripts t WHERE t.call_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM call_summaries s WHERE s.call_id = c.id);

UPDATE calendars SET last_synced_at = NULL WHERE calendar_type = 'ical';
