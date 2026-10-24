#!/usr/bin/env bash
# Copy Supabase Storage files into the private Cloud Storage bucket, as
# "<bucket>/<path>" objects (the layout helm-api's /storage/v1 routes serve).
# Re-runnable: files already in Cloud Storage with the same size are skipped.
#
# Env:
#   SUPABASE_SERVICE_ROLE_KEY  Secret Manager (reads every bucket, incl. private)
#   PGPASSWORD / PGUSER        Cloud SQL, to read the file list helm-resync captured
#   CSQL_HOST, LIST_DB         default /cloudsql/...:helm-db, helm_v2
#   GCS_BUCKET                 default helm-496923-files-private
#   PARALLEL                   default 8
set -uo pipefail
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY secret missing}"
export SUPA="${SUPABASE_URL:-https://upbjdmnykheubxkuknuj.supabase.co}"
export GCS_BUCKET="${GCS_BUCKET:-helm-496923-files-private}"
export PGUSER="${PGUSER:-helmuser}"
CSQL_HOST="${CSQL_HOST:-/cloudsql/helm-496923:us-central1:helm-db}"
LIST_DB="${LIST_DB:-helm_v2}"
PARALLEL="${PARALLEL:-8}"
W=/tmp/files; mkdir -p "$W"
log() { echo "[files $(date -u +%H:%M:%S)] $*"; }

urlencode() { local LC_ALL=C s="$1" out="" c i; for ((i = 0; i < ${#s}; i++)); do c=${s:i:1}; case "$c" in [a-zA-Z0-9.~_-]) out+="$c" ;; *) out+=$(printf '%%%02X' "'$c") ;; esac; done; printf '%s' "$out"; }
export -f urlencode

token() { curl -sf -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | sed -E 's/.*"access_token":"([^"]+)".*/\1/'; }

copy_one() {
  local line="$1" b n size mime obj enc path tmp tok
  IFS=$'\t' read -r b n size mime <<<"$line"
  obj="$b/$n"; enc=$(urlencode "$obj"); path=$(urlencode "$n" | sed 's/%2F/\//g')
  tok=$(cat "$TOKFILE")
  if curl -sf -H "Authorization: Bearer $tok" "https://storage.googleapis.com/storage/v1/b/$GCS_BUCKET/o/$enc?fields=size" | grep -q "\"size\": *\"$size\""; then echo "SKIP"; return 0; fi
  tmp=$(mktemp -p /tmp/files)
  if ! curl -sf -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -o "$tmp" "$SUPA/storage/v1/object/$b/$path"; then
    rm -f "$tmp"; echo "FAIL download $obj"; return 0
  fi
  if curl -sf -X POST -H "Authorization: Bearer $tok" -H "Content-Type: ${mime:-application/octet-stream}" --data-binary @"$tmp" \
       "https://storage.googleapis.com/upload/storage/v1/b/$GCS_BUCKET/o?uploadType=media&name=$enc" >/dev/null; then
    echo "OK"
  else
    echo "FAIL upload $obj"
  fi
  rm -f "$tmp"
}
export -f copy_one

export TOKFILE="$W/token"
token > "$TOKFILE" || { log "no metadata token"; exit 3; }
( while sleep 1500; do token > "$TOKFILE.new" && mv "$TOKFILE.new" "$TOKFILE"; done ) &

psql "host=$CSQL_HOST dbname=$LIST_DB" -X -At -F $'\t' -c \
  "select bucket_id, name, coalesce(size, 0), coalesce(mimetype, 'application/octet-stream') from _migration.supabase_objects where name not like '%/.emptyFolderPlaceholder' order by bucket_id, name" > "$W/list" \
  || { log "could not read file list (run helm-resync first)"; exit 3; }
TOTAL=$(wc -l < "$W/list"); log "files to check: $TOTAL"

tr '\n' '\0' < "$W/list" | xargs -0 -P "$PARALLEL" -I{} bash -c 'copy_one "$1"' _ {} > "$W/results"
OK=$(grep -c '^OK' "$W/results" || true); SKIP=$(grep -c '^SKIP' "$W/results" || true); FAIL=$(grep -c '^FAIL' "$W/results" || true)
log "done: copied=$OK already_there=$SKIP failed=$FAIL of $TOTAL"
grep '^FAIL' "$W/results" | head -50
[ "$FAIL" -eq 0 ]
