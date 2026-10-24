-- CUTOVER. Applied by helm-api on its first boot against helm_v2.
--
-- 1. App-user permissions, rebuilt to match Supabase before the cutover freeze.
--    (The freeze revoked writes in Supabase before the final copy, and Postgres 17's
--    MAINTAIN privilege in the dump failed on Cloud SQL, so the copied grants are
--    incomplete.) Supabase had: authenticated -> SELECT, REFERENCES, TRIGGER on
--    every public relation except six internal ones; writes per
--    _helm_freeze_snapshot (taken just before the freeze); anon -> no table access.
GRANT SELECT, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO authenticated;
DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT grantee, object_name, privilege FROM public._helm_freeze_snapshot
            WHERE kind = 'grant' AND privilege IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE') AND grantee IN ('anon', 'authenticated')
  LOOP
    IF to_regclass(format('public.%I', r.object_name)) IS NOT NULL THEN
      EXECUTE format('GRANT %s ON public.%I TO %I', r.privilege, r.object_name, r.grantee);
    END IF;
  END LOOP;
END
$g$;
DO $r$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['_qc_dedup_backup_20260624', 'cron_run_log', 'v_unassigned_accounts', 'shopify_backfill_state',
                           'wms_3pl_shipment_rollup', '_asana_dedupe_map', '_helm_migrations', '_resync_report', '_helm_freeze_snapshot']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END
$r$;

-- 2. Mark this database live: helm-resync refuses to rebuild it from now on.
CREATE TABLE IF NOT EXISTS _cutover_live (went_live_at timestamptz NOT NULL DEFAULT now(), note text);
INSERT INTO _cutover_live (note) SELECT 'Helm moved from Supabase to Google Cloud' WHERE NOT EXISTS (SELECT 1 FROM _cutover_live);
REVOKE ALL ON TABLE _cutover_live FROM anon, authenticated;
