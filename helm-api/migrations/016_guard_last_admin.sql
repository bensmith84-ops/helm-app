-- Never leave an org without an active owner/admin: block any update or
--    delete that would demote, deactivate or remove the last one.
CREATE OR REPLACE FUNCTION guard_last_org_admin() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role IN ('owner', 'admin') AND OLD.is_active
     AND (TG_OP = 'DELETE' OR NEW.role NOT IN ('owner', 'admin') OR NOT NEW.is_active)
     AND NOT EXISTS (SELECT 1 FROM org_memberships o
                      WHERE o.org_id = OLD.org_id AND o.id <> OLD.id
                        AND o.role IN ('owner', 'admin') AND o.is_active) THEN
    RAISE EXCEPTION 'Cannot remove the last admin of this organization' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_guard_last_org_admin ON org_memberships;
CREATE TRIGGER trg_guard_last_org_admin
  BEFORE UPDATE OR DELETE ON org_memberships
  FOR EACH ROW EXECUTE FUNCTION guard_last_org_admin();
