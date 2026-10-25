-- Speed up row-level security. Most policies call active_org() (and some
-- is_internal_user() / auth.uid()) bare, so Postgres runs the function, and its
-- profiles lookup, once per row: reading 11k tasks did 11k lookups. Wrapping
-- each call as (SELECT fn()) makes it a one-off InitPlan with the same result.
--
-- external_collab_* policies grant project-scoped access to external
-- collaborators; has_project_scope() already returns true for every internal
-- user, so for internal users they only re-grant rows org_iso_* already
-- allows (every such row is in the org; checked 25 Oct 2026), at the cost of
-- per-row subqueries. Gate them on NOT (SELECT is_internal_user()) so internal
-- users skip that work; externals are unchanged.
DO $m$
DECLARE
  p record; q text; c text; nq text; nc text; changed int := 0; failed int := 0;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname, qual, with_check
             FROM pg_policies WHERE schemaname = 'public'
  LOOP
    q := p.qual; c := p.with_check; nq := q; nc := c;
    IF nq IS NOT NULL THEN
      nq := replace(replace(replace(nq, 'SELECT active_org()', '#AO#'), 'active_org()', '(SELECT active_org())'), '#AO#', 'SELECT active_org()');
      nq := replace(replace(replace(nq, 'SELECT is_internal_user()', '#IU#'), 'is_internal_user()', '(SELECT is_internal_user())'), '#IU#', 'SELECT is_internal_user()');
      nq := replace(replace(replace(nq, 'SELECT auth.uid()', '#UID#'), 'auth.uid()', '(SELECT auth.uid())'), '#UID#', 'SELECT auth.uid()');
      IF p.policyname LIKE 'external_collab_%' AND position('NOT (SELECT is_internal_user())' IN nq) = 0 THEN
        nq := '(NOT (SELECT is_internal_user())) AND (' || nq || ')';
      END IF;
    END IF;
    IF nc IS NOT NULL THEN
      nc := replace(replace(replace(nc, 'SELECT active_org()', '#AO#'), 'active_org()', '(SELECT active_org())'), '#AO#', 'SELECT active_org()');
      nc := replace(replace(replace(nc, 'SELECT is_internal_user()', '#IU#'), 'is_internal_user()', '(SELECT is_internal_user())'), '#IU#', 'SELECT is_internal_user()');
      nc := replace(replace(replace(nc, 'SELECT auth.uid()', '#UID#'), 'auth.uid()', '(SELECT auth.uid())'), '#UID#', 'SELECT auth.uid()');
    END IF;
    IF nq IS DISTINCT FROM q OR nc IS DISTINCT FROM c THEN
      BEGIN
        IF nq IS NOT NULL AND nc IS NOT NULL THEN
          EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, nq, nc);
        ELSIF nq IS NOT NULL THEN
          EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, nq);
        ELSE
          EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, nc);
        END IF;
        changed := changed + 1;
      EXCEPTION WHEN others THEN
        failed := failed + 1;
        RAISE NOTICE 'policy %.% not changed: %', p.tablename, p.policyname, SQLERRM;
      END;
    END IF;
  END LOOP;
  RAISE NOTICE 'rls initplan: % policies updated, % skipped', changed, failed;
END
$m$;
