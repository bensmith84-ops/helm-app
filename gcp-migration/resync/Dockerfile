# Build context is assembled by cloudbuild.yaml (resync-ctx/: this folder plus
# helm-api/migrations), because the repo-root .dockerignore excludes gcp-migration.
FROM postgres:17-bookworm
COPY resync.sh /resync.sh
COPY fixes.sql /fixes.sql
COPY migrations /migrations
RUN chmod +x /resync.sh
USER postgres
ENTRYPOINT ["/resync.sh"]
