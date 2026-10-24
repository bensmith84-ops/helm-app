# Built from the repo root (see cloudbuild.yaml) so the copy can also apply
# helm-api's table migrations and the schema fixes in fixes.sql.
FROM postgres:17-bookworm
COPY gcp-migration/resync/resync.sh /resync.sh
COPY gcp-migration/resync/fixes.sql /fixes.sql
COPY helm-api/migrations /migrations
RUN chmod +x /resync.sh
USER postgres
ENTRYPOINT ["/resync.sh"]
