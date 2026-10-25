-- Imported calendar events (iCal feeds, external_event_id set) must not get a
-- Helm video call. The iCal sync deletes and re-inserts every event, so this
-- trigger created ~1,130 new calls per sync (13,560 by 25 Oct 2026) and
-- replaced each event's real Meet/Zoom link with a helm.app/call link.
-- Helm-native events (no external_event_id) behave as before.
CREATE OR REPLACE FUNCTION public.auto_create_call_for_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_call_id UUID;
BEGIN
  IF NEW.has_video_call = true AND NEW.call_id IS NULL AND NEW.external_event_id IS NULL THEN
    INSERT INTO calls (
      org_id, title, call_type, status, media_mode,
      source_type, calendar_event_id,
      scheduled_start, scheduled_end,
      created_by
    ) VALUES (
      NEW.org_id, NEW.title, 'scheduled', 'waiting', 'video',
      'calendar_event', NEW.id,
      NEW.start_at, NEW.end_at,
      NEW.organizer_id
    ) RETURNING id INTO v_call_id;

    NEW.call_id := v_call_id;
    NEW.video_link := 'https://helm.app/call/' || (SELECT room_id FROM calls WHERE id = v_call_id);
  END IF;
  RETURN NEW;
END;
$function$;
