-- Index for the per-request profile resolution in requireAuth and the
-- auth.uid() shim, both of which look up profiles by firebase_uid.
CREATE INDEX IF NOT EXISTS idx_profiles_firebase_uid
  ON profiles (firebase_uid)
  WHERE firebase_uid IS NOT NULL;
