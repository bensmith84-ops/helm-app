-- Index of every QuickBooks attachment and the transaction it hangs off, built
-- from one paged scan of Attachable during the QuickBooks sync. Lets Transaction
-- Search show which transactions have an invoice/receipt without asking QBO per row;
-- the file itself is downloaded the first time someone opens it.
CREATE TABLE IF NOT EXISTS qbo_attachment_index (
  entity_type   text NOT NULL,
  qbo_id        text NOT NULL,
  attachable_id text NOT NULL,
  file_name     text,
  content_type  text,
  indexed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, qbo_id, attachable_id)
);
REVOKE ALL ON qbo_attachment_index FROM PUBLIC;
DO $p$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON qbo_attachment_index FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON qbo_attachment_index FROM authenticated; END IF;
END $p$;
