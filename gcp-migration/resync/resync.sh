#!/usr/bin/env bash
# Copy Supabase (live) into a FRESH Cloud SQL database, without touching the
# database helm-api currently uses. Safe to re-run: the target is dropped and
# rebuilt every time, unless it has been marked live (_cutover_live table).
#
# Env:
#   SUPABASE_DB_URL  Supabase session-pooler connection string (Secret Manager)
#   PGPASSWORD       Cloud SQL helmuser password (Secret Manager)
#   PGUSER           default helmuser
#   CSQL_HOST        default /cloudsql/helm-496923:us-central1:helm-db
#   SRC_DB           current Cloud SQL database, used for the auth shim (default helm)
#   TARGET_DB        database to rebuild (default helm_v2)
set -uo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL secret missing}"
: "${PGPASSWORD:?PGPASSWORD missing}"
export PGUSER="${PGUSER:-helmuser}"
CSQL_HOST="${CSQL_HOST:-/cloudsql/helm-496923:us-central1:helm-db}"
SRC_DB="${SRC_DB:-helm}"
TARGET_DB="${TARGET_DB:-helm_v2}"
W=/tmp/resync; mkdir -p "$W"; ERR="$W/errors.log"; : > "$ERR"
log() { echo "[resync $(date -u +%H:%M:%S)] $*"; }
cs()  { local db="$1"; shift; psql "host=$CSQL_HOST dbname=$db" -X -q "$@"; }
supa() { psql "$SUPABASE_DB_URL" -X -q "$@"; }
supa_dump() { pg_dump "$SUPABASE_DB_URL" "$@"; }

if [[ "$TARGET_DB" == "$SRC_DB" || "$TARGET_DB" == "helm" || "$TARGET_DB" == "postgres" ]]; then
  log "refusing: TARGET_DB=$TARGET_DB is not a scratch database"; exit 2
fi
log "source: $(supa -Atc 'select version()' 2>&1 | head -c 80)"
supa -Atc 'select 1' >/dev/null || { log "cannot connect to Supabase"; exit 3; }
cs "$SRC_DB" -Atc 'select 1' >/dev/null || { log "cannot connect to Cloud SQL"; exit 3; }
if [[ "$(cs "$TARGET_DB" -Atc "select to_regclass('public._cutover_live') is not null" 2>/dev/null)" == "t" ]]; then
  log "refusing: $TARGET_DB is marked live"; exit 2
fi

T0=$(date +%s)
log "1/8 recreate $TARGET_DB"
cs postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$TARGET_DB\"" || { log "could not recreate target"; exit 4; }

log "2/8 roles and extensions (mirroring $SRC_DB's layout)"
cs postgres -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT; END IF;
END \$\$;" 2>>"$ERR"
cs "$TARGET_DB" -c "CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS _migration;" 2>>"$ERR"
cs "$SRC_DB" -Atc "select e.extname || '|' || n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql'" |
while IFS='|' read -r ext sch; do
  cs "$TARGET_DB" -c "CREATE SCHEMA IF NOT EXISTS \"$sch\"; CREATE EXTENSION IF NOT EXISTS \"$ext\" WITH SCHEMA \"$sch\"" 2>>"$ERR" && log "   ext $ext ($sch)"
done

# Extensions Supabase's public schema uses (e.g. pg_trgm for search indexes),
# skipping Supabase-only ones Cloud SQL doesn't offer.
supa -Atc "select e.extname || '|' || case when n.nspname in ('public','extensions') then n.nspname else 'extensions' end from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname not in ('plpgsql','pg_graphql','pg_stat_statements','supabase_vault','pgsodium','pg_net','pg_cron','pgjwt','wrappers','supautils','pg_tle','plpgsql_check')" |
while IFS='|' read -r ext sch; do
  if cs "$TARGET_DB" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS \"$ext\" WITH SCHEMA \"$sch\"" 2>/dev/null; then log "   ext $ext ($sch, from Supabase)"
  elif cs "$TARGET_DB" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS \"$ext\" WITH SCHEMA public" 2>>"$ERR"; then log "   ext $ext (public, fallback)"
  else log "   ext $ext unavailable on Cloud SQL"; fi
done

log "3/8 extension wrappers from $SRC_DB, and Supabase-native auth.* functions"
pg_dump "host=$CSQL_HOST dbname=$SRC_DB" --schema-only --no-owner --no-privileges -n extensions |
  cs "$TARGET_DB" 2>>"$ERR"
# auth.uid()/jwt()/role()/email() read the claims helm-api sets per request
# (sub = Helm profile id), exactly as Supabase's PostgREST does.
cs "$TARGET_DB" 2>>"$ERR" <<'SQL'
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$f$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), auth.jwt() ->> 'sub'), '')::uuid
$f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role')
$f$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.email', true), ''), auth.jwt() ->> 'email')
$f$;
SQL

# Supabase-compatible auth.users so foreign keys and policies that reference it
# restore. Rows are loaded in step 6; after cutover, new sign-ins get a row from
# helm-api when their profile is created.
cs "$TARGET_DB" 2>>"$ERR" <<'SQL'
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  instance_id uuid,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_sent_at timestamptz,
  recovery_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text,
  phone_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_sso_user boolean NOT NULL DEFAULT false,
  is_anonymous boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS users_email_idx ON auth.users (lower(email));
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text
);
CREATE INDEX IF NOT EXISTS identities_user_id_idx ON auth.identities (user_id);
SQL

log "4/8 Supabase public schema (tables, types, functions)"
supa_dump --section=pre-data -n public --no-owner | cs "$TARGET_DB" 2>>"$ERR"

log "5/8 Supabase public data (streamed)"
supa_dump --section=data -n public --no-owner --no-privileges | cs "$TARGET_DB" 2>>"$ERR"

log "6/8 Supabase auth.users and auth.identities"
for T in users identities; do
  TCOLS=$(cs "$TARGET_DB" -Atc "select string_agg(column_name, ' ') from information_schema.columns where table_schema='auth' and table_name='$T' and is_generated='NEVER'")
  SCOLS=$(supa -Atc "select string_agg(column_name, ' ') from information_schema.columns where table_schema='auth' and table_name='$T' and is_generated='NEVER'")
  COLS=$(comm -12 <(tr ' ' '\n' <<<"$TCOLS" | sort) <(tr ' ' '\n' <<<"$SCOLS" | sort) | sed 's/.*/"&"/' | paste -sd, -)
  if [[ -n "$COLS" ]]; then
    supa -c "\\copy (select $COLS from auth.$T) to stdout" | cs "$TARGET_DB" -c "\\copy auth.$T($COLS) from stdin" 2>>"$ERR" && log "   auth.$T: $(cs "$TARGET_DB" -Atc "select count(*) from auth.$T") rows"
  else
    log "   auth.$T: no matching columns; skipped"
  fi
done
# Full export kept privately for the Firebase sign-in import (password hashes
# are bcrypt; never exposed through the API).
cs "$TARGET_DB" -c "CREATE TABLE _migration.supabase_auth_users (id uuid primary key, email text, encrypted_password text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz, providers text, raw_user_meta_data jsonb, raw_app_meta_data jsonb)" 2>>"$ERR"
supa -c "\\copy (select u.id, u.email, u.encrypted_password, u.email_confirmed_at, u.last_sign_in_at, u.created_at, (select string_agg(distinct i.provider, ',') from auth.identities i where i.user_id = u.id), u.raw_user_meta_data, u.raw_app_meta_data from auth.users u) to stdout" |
  cs "$TARGET_DB" -c "\\copy _migration.supabase_auth_users from stdin" 2>>"$ERR"

log "   Supabase inventory: scheduled jobs, storage buckets and file list (metadata only)"
cs "$TARGET_DB" 2>>"$ERR" <<'SQL'
CREATE TABLE IF NOT EXISTS _migration.supabase_cron_jobs (jobid bigint, jobname text, schedule text, command text, active boolean, last_status text, last_run timestamptz);
CREATE TABLE IF NOT EXISTS _migration.supabase_buckets (id text, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS _migration.supabase_objects (bucket_id text, name text, size bigint, mimetype text, created_at timestamptz, updated_at timestamptz);
SQL
supa -c "\\copy (select j.jobid, j.jobname, j.schedule, j.command, j.active, (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1), (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) from cron.job j) to stdout" 2>>"$ERR" |
  cs "$TARGET_DB" -c "\\copy _migration.supabase_cron_jobs from stdin" 2>>"$ERR"
supa -c "\\copy (select id, name, public, file_size_limit, allowed_mime_types from storage.buckets) to stdout" 2>>"$ERR" |
  cs "$TARGET_DB" -c "\\copy _migration.supabase_buckets from stdin" 2>>"$ERR"
supa -c "\\copy (select bucket_id, name, (metadata->>'size')::bigint, metadata->>'mimetype', created_at, updated_at from storage.objects) to stdout" 2>>"$ERR" |
  cs "$TARGET_DB" -c "\\copy _migration.supabase_objects from stdin" 2>>"$ERR"
log "   cron jobs: $(cs "$TARGET_DB" -Atc "select count(*) from _migration.supabase_cron_jobs"), buckets: $(cs "$TARGET_DB" -Atc "select count(*) from _migration.supabase_buckets"), files: $(cs "$TARGET_DB" -Atc "select count(*) || ' (' || pg_size_pretty(coalesce(sum(size),0)) || ')' from _migration.supabase_objects")"

log "7/8 constraints, indexes, triggers, policies"
supa_dump --section=post-data -n public --no-owner | cs "$TARGET_DB" 2>>"$ERR"

log "   Helm additions: profiles.firebase_uid (links a Firebase sign-in to its profile)"
cs "$TARGET_DB" 2>>"$ERR" <<'SQL'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS firebase_uid text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_firebase_uid_key ON public.profiles (firebase_uid) WHERE firebase_uid IS NOT NULL;
SQL

log "8/8 grants: Supabase's own GRANTs came with the schema; add schema usage and lock _migration"
cs "$TARGET_DB" 2>>"$ERR" <<'SQL'
GRANT USAGE ON SCHEMA public, auth, extensions TO authenticated, anon;
REVOKE ALL ON SCHEMA _migration FROM PUBLIC;
SQL

log "   schema fixes (fixes.sql) and helm-api table migrations"
cs "$TARGET_DB" -v ON_ERROR_STOP=1 -f /fixes.sql 2>>"$ERR" || log "   WARNING: fixes.sql failed (see errors)"
cs "$TARGET_DB" -c "CREATE TABLE IF NOT EXISTS _helm_migrations (filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())" 2>>"$ERR"
for f in /migrations/*.sql; do
  [ -e "$f" ] || continue
  name=$(basename "$f"); sum=$(sha256sum "$f" | cut -d' ' -f1)
  case "$name" in
    # Role/grant migrations were written for the old snapshot; the copy keeps
    # Supabase's exact grants instead. Recorded as applied so helm-api skips them.
    003_*|004_*) ;;
    *) cs "$TARGET_DB" -v ON_ERROR_STOP=1 -1 -f "$f" 2>>"$ERR" || { log "   WARNING: migration $name failed"; continue; } ;;
  esac
  cs "$TARGET_DB" -c "INSERT INTO _helm_migrations (filename, sha256) VALUES ('$name', '$sum') ON CONFLICT (filename) DO NOTHING" 2>>"$ERR"
  log "   migration $name"
done

log "verify: exact row counts, Supabase vs $TARGET_DB"
RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)
cs "$SRC_DB" -c "CREATE TABLE IF NOT EXISTS _resync_report (run_id text, kind text, name text, supabase bigint, target bigint, detail text, at timestamptz default now()); REVOKE ALL ON _resync_report FROM authenticated, anon;" 2>>"$ERR"
supa -Atc "select tablename from pg_tables where schemaname='public' order by 1" > "$W/tables"
MISMATCH=0; N=0
while read -r t; do
  [[ -z "$t" ]] && continue; N=$((N+1))
  a=$(supa -Atc "select count(*) from public.\"$t\"" 2>/dev/null || echo -1)
  b=$(cs "$TARGET_DB" -Atc "select count(*) from public.\"$t\"" 2>/dev/null || echo -1)
  [[ "$a" != "$b" ]] && MISMATCH=$((MISMATCH+1))
  cs "$SRC_DB" -c "insert into _resync_report (run_id, kind, name, supabase, target) values ('$RUN_ID', 'table', \$q\$$t\$q\$, $a, $b)" 2>/dev/null
done < "$W/tables"
sed -i -e '/role "\(supabase_[a-z_]*\|dashboard_user\|pgbouncer\|authenticator\|supabase_auth_admin\|supabase_storage_admin\)" does not exist/d' -e '/transaction_timeout/d' -e '/schema "\(public\|auth\|extensions\|_migration\)" already exists/d' "$ERR"
NERR=$(grep -c 'ERROR:' "$ERR" || true)
grep 'ERROR:' "$ERR" | sed 's/^psql:[^:]*:[0-9]*: //' | sort | uniq -c | sort -rn | head -200 |
while read -r cnt msg; do
  cs "$SRC_DB" -c "insert into _resync_report (run_id, kind, name, supabase, detail) values ('$RUN_ID', 'error', 'restore', $cnt, \$q\$${msg:0:500}\$q\$)" 2>/dev/null
done
SUMMARY="tables=$N mismatched=$MISMATCH errors=$NERR seconds=$(( $(date +%s) - T0 ))"
cs "$SRC_DB" -c "insert into _resync_report (run_id, kind, name, detail) values ('$RUN_ID', 'summary', '$TARGET_DB', '$SUMMARY')"
log "done: $SUMMARY"
log "top errors:"; grep 'ERROR:' "$ERR" | sed 's/^psql:[^:]*:[0-9]*: //' | sort | uniq -c | sort -rn | head -25
