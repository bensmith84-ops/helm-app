-- The app needs to show QuickBooks connection status, but qbo_connections holds the
-- OAuth tokens and is never exposed through /rest. This view carries every column
-- except the tokens. security_invoker keeps the base table's org-isolation policy
-- in force for whoever queries it. It is a simple view, so DELETE (Disconnect)
-- passes through to qbo_connections under the same policy.
CREATE OR REPLACE VIEW qbo_connection_status WITH (security_invoker = true) AS
  SELECT id, org_id, realm_id, company_name, environment, connected_by,
         connected_at, last_synced_at, sync_status, last_error, token_expires_at
    FROM qbo_connections;
REVOKE ALL ON qbo_connection_status FROM PUBLIC, anon;
GRANT SELECT, DELETE ON qbo_connection_status TO authenticated;
