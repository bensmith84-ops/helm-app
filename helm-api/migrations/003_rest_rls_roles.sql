-- Roles the /rest/v1 shim switches into so row-level security applies, the
-- same way PostgREST does on Supabase. helmuser owns the tables and bypasses
-- RLS; "authenticated" does not.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
END $$;
GRANT authenticated TO CURRENT_USER;
GRANT anon TO CURRENT_USER;
