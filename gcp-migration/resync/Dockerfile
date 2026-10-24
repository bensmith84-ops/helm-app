# Build context is assembled by cloudbuild.yaml (resync-ctx/: this folder plus
# helm-api/migrations), because the repo-root .dockerignore excludes gcp-migration.
# One image, two jobs: helm-resync (default entrypoint) and helm-files-copy
# (--command=/copy-files.sh).
FROM postgres:17-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY resync.sh /resync.sh
COPY copy-files.sh /copy-files.sh
COPY fixes.sql /fixes.sql
COPY migrations /migrations
RUN chmod +x /resync.sh /copy-files.sh
USER postgres
ENTRYPOINT ["/resync.sh"]
