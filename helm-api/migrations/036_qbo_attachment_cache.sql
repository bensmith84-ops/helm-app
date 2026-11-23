-- Attachments found on QuickBooks transactions other than bills (card charges,
-- journal entries, deposits, payments), looked up on demand from Transaction
-- Search. Bills keep theirs on qbo_bills.attachment_url. files = [{ file_name, url, content_type }].
CREATE TABLE IF NOT EXISTS qbo_attachment_cache (
  entity_type text NOT NULL,
  qbo_id      text NOT NULL,
  files       jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, qbo_id)
);
REVOKE ALL ON qbo_attachment_cache FROM PUBLIC;
DO $p$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON qbo_attachment_cache FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON qbo_attachment_cache FROM authenticated; END IF;
END $p$;
