-- Fixes applied on top of Supabase's schema in every helm-resync copy.
-- Each is idempotent. Keep them here (not in Supabase) so they ship with the
-- move to Google Cloud.

-- 1. Calendar events with a video call failed to insert: the BEFORE INSERT
--    trigger created a calls row pointing at the event before the event row
--    existed (calls_calendar_event_id_fkey). Inserts now create the call AFTER
--    the event exists; updates keep the BEFORE path (row already exists).
CREATE OR REPLACE FUNCTION public.auto_create_call_for_event()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_call_id UUID;
BEGIN
  IF NEW.has_video_call = true AND NEW.call_id IS NULL THEN
    INSERT INTO calls (org_id, title, call_type, status, media_mode, source_type, calendar_event_id, scheduled_start, scheduled_end, created_by)
    VALUES (NEW.org_id, NEW.title, 'scheduled', 'waiting', 'video', 'calendar_event', NEW.id, NEW.start_at, NEW.end_at, NEW.organizer_id)
    RETURNING id INTO v_call_id;
    IF TG_WHEN = 'BEFORE' THEN
      NEW.call_id := v_call_id;
      NEW.video_link := 'https://helm.app/call/' || (SELECT room_id FROM calls WHERE id = v_call_id);
    ELSE
      UPDATE calendar_events
         SET call_id = v_call_id,
             video_link = 'https://helm.app/call/' || (SELECT room_id FROM calls WHERE id = v_call_id)
       WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS auto_create_event_call ON public.calendar_events;
DROP TRIGGER IF EXISTS auto_create_event_call_insert ON public.calendar_events;
CREATE TRIGGER auto_create_event_call BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_call_for_event();
CREATE TRIGGER auto_create_event_call_insert AFTER INSERT ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_call_for_event();
