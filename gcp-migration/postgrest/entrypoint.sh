#!/bin/sh
# libpq reads PGPASSWORD from the environment, so the URI carries no secret.
set -eu
: "${PGPASSWORD:?PGPASSWORD missing}"
export PGRST_DB_URI="host=${PGHOST:-/cloudsql/helm-496923:us-central1:helm-db} dbname=${PGDATABASE:-helm_v2} user=${PGUSER:-helmuser}"
# Same derivation as helm-api (lib/postgrest.js): both sides compute the HS256
# key from the database password, so there is no extra secret to manage.
export PGRST_JWT_SECRET="$(printf 'helm-postgrest-jwt:%s' "$PGPASSWORD" | sha256sum | cut -c1-64)"
export PGRST_SERVER_PORT="${PORT:-8080}"
export PGRST_DB_SCHEMAS="${PGRST_DB_SCHEMAS:-public}"
export PGRST_DB_ANON_ROLE="${PGRST_DB_ANON_ROLE:-anon}"
export PGRST_DB_EXTRA_SEARCH_PATH="${PGRST_DB_EXTRA_SEARCH_PATH:-public,extensions}"
export PGRST_DB_POOL="${PGRST_DB_POOL:-10}"
export PGRST_DB_CHANNEL_ENABLED="${PGRST_DB_CHANNEL_ENABLED:-false}"
export PGRST_DB_MAX_ROWS="${PGRST_DB_MAX_ROWS:-}"
export PGRST_LOG_LEVEL="${PGRST_LOG_LEVEL:-warn}"
[ -z "$PGRST_DB_MAX_ROWS" ] && unset PGRST_DB_MAX_ROWS
exec /usr/local/bin/postgrest
