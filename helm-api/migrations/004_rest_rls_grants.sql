-- Same privileges Supabase gives "authenticated"; RLS policies do the filtering.
GRANT USAGE ON SCHEMA public TO authenticated, anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN EXECUTE 'GRANT USAGE ON SCHEMA auth TO authenticated, anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN EXECUTE 'GRANT USAGE ON SCHEMA extensions TO authenticated, anon'; END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
-- Internal tables stay owner-only.
REVOKE ALL ON TABLE _helm_migrations FROM authenticated, anon;
REVOKE ALL ON TABLE cron_run_log FROM authenticated, anon;
