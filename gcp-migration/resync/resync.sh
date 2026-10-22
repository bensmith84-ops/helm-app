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

log "3/8 auth shim and extension wrappers from $SRC_DB"
pg_dump "host=$CSQL_HOST dbname=$SRC_DB" --schema-only --no-owner --no-privileges -n auth -n extensions |
  cs "$TARGET_DB" 2>>"$ERR"

log "4/8 Supabase public schema (tables, types, functions)"
supa_dump --section=pre-data -n public --no-owner --no-privileges | cs "$TARGET_DB" 2>>"$ERR"

log "5/8 Supabase public data (streamed)"
supa_dump --section=data -n public --no-owner --no-privileges | cs "$TARGET_DB" 2>>"$ERR"

log "6/8 Supabase auth.users"
TCOLS=$(cs "$TARGET_DB" -Atc "select string_agg(column_name, ' ') from information_schema.columns where table_schema='auth' and table_name='users' and is_generated='NEVER'")
SCOLS=$(supa -Atc "select string_agg(column_name, ' ') from information_schema.columns where table_schema='auth' and table_name='users' and is_generated='NEVER'")
COLS=$(comm -12 <(tr ' ' '\n' <<<"$TCOLS" | sort) <(tr ' ' '\n' <<<"$SCOLS" | sort) | sed 's/.*/"&"/' | paste -sd, -)
if [[ -n "$COLS" ]]; then
  supa -c "\\copy (select $COLS from auth.users) to stdout" | cs "$TARGET_DB" -c "\\copy auth.users($COLS) from stdin" 2>>"$ERR" && log "   auth.users columns: $COLS"
else
  log "   no auth.users table in shim; skipping (FKs to auth.users will be listed as errors)"
fi
# Full export kept privately for the Firebase sign-in import (password hashes
# are bcrypt; never exposed through the API).
cs "$TARGET_DB" -c "CREATE TABLE _migration.supabase_auth_users (id uuid primary key, email text, encrypted_password text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz, providers text, raw_user_meta_data jsonb, raw_app_meta_data jsonb)" 2>>"$ERR"
supa -c "\\copy (select u.id, u.email, u.encrypted_password, u.email_confirmed_at, u.last_sign_in_at, u.created_at, (select string_agg(distinct i.provider, ',') from auth.identities i where i.user_id = u.id), u.raw_user_meta_data, u.raw_app_meta_data from auth.users u) to stdout" |
  cs "$TARGET_DB" -c "\\copy _migration.supabase_auth_users from stdin" 2>>"$ERR"

log "7/8 constraints, indexes, triggers, policies"
supa_dump --section=post-data -n public --no-owner --no-privileges | cs "$TARGET_DB" 2>>"$ERR"

log "8/8 grants (same as helm-api migrations 003/004)"
cs "$TARGET_DB" 2>>"$ERR" <<'SQL'
GRANT USAGE ON SCHEMA public, auth, extensions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
REVOKE ALL ON SCHEMA _migration FROM PUBLIC;
SQL

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
NERR=$(grep -c 'ERROR:' "$ERR" || true)
grep 'ERROR:' "$ERR" | sed 's/^psql:[^:]*:[0-9]*: //' | sort | uniq -c | sort -rn | head -200 |
while read -r cnt msg; do
  cs "$SRC_DB" -c "insert into _resync_report (run_id, kind, name, supabase, detail) values ('$RUN_ID', 'error', 'restore', $cnt, \$q\$${msg:0:500}\$q\$)" 2>/dev/null
done
SUMMARY="tables=$N mismatched=$MISMATCH errors=$NERR seconds=$(( $(date +%s) - T0 ))"
cs "$SRC_DB" -c "insert into _resync_report (run_id, kind, name, detail) values ('$RUN_ID', 'summary', '$TARGET_DB', '$SUMMARY')"
log "done: $SUMMARY"
log "top errors:"; grep 'ERROR:' "$ERR" | sed 's/^psql:[^:]*:[0-9]*: //' | sort | uniq -c | sort -rn | head -25
