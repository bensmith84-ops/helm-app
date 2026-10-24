-- Marks this database as the live Helm database. helm-resync refuses to
-- rebuild a database that has this table, so the copy job can never wipe
-- production after the cutover.
CREATE TABLE IF NOT EXISTS _cutover_live (went_live_at timestamptz NOT NULL DEFAULT now(), note text);
INSERT INTO _cutover_live (note) SELECT 'Helm moved from Supabase to Google Cloud' WHERE NOT EXISTS (SELECT 1 FROM _cutover_live);
REVOKE ALL ON TABLE _cutover_live FROM PUBLIC;
