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

-- 2. Stored links to Supabase Storage public files (attachments, avatars,
--    logos, bill PDFs...) point at supabase.co, which goes away. Point them at
--    helm-api's /storage/v1 routes, which serve the same paths from Cloud
--    Storage (files copied by the helm-files-copy job). Covers every text,
--    varchar and jsonb column in public tables.
DO $fix$
DECLARE
  r record;
  old_base text := 'https://upbjdmnykheubxkuknuj.supabase.co/storage/v1/object/public/';
  new_base text := 'https://helm-api-qp7o2dcl5a-uc.a.run.app/storage/v1/object/public/';
  n bigint; total bigint := 0;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.data_type IN ('text', 'character varying', 'jsonb') AND c.is_generated = 'NEVER'
  LOOP
    BEGIN  -- one column at a time; a failing trigger skips that column only
      IF r.data_type = 'jsonb' THEN
        EXECUTE format('UPDATE public.%I SET %I = replace(%I::text, $1, $2)::jsonb WHERE strpos(%I::text, $1) > 0', r.table_name, r.column_name, r.column_name, r.column_name) USING old_base, new_base;
      ELSE
        EXECUTE format('UPDATE public.%I SET %I = replace(%I, $1, $2) WHERE strpos(%I, $1) > 0', r.table_name, r.column_name, r.column_name, r.column_name) USING old_base, new_base;
      END IF;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN RAISE NOTICE 'storage links: %.% rows=%', r.table_name, r.column_name, n; total := total + n; END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'storage links: %.% skipped: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'storage links rewritten: % rows', total;
END
$fix$;
