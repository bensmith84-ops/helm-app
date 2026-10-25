-- 1. Restore Ben Smith's admin membership. On 25 Oct 2026 the app's
--    "new user" path ran for him (his profile lookup came back empty before
--    sign-in was ready) and overwrote his row with member / default-deny.
--    Value restored from the pre-move Supabase copy. Only applied while the
--    org has no admin or owner, so it never overrides a later deliberate change.
UPDATE org_memberships m
   SET role = 'admin',
       module_permissions = '{"projects": true, "settings": true, "dashboard": true}'::jsonb
 WHERE m.user_id = '32cad5dd-9e94-4095-a16d-b4521391b050'
   AND m.org_id  = 'a0000000-0000-0000-0000-000000000001'
   AND m.role = 'member'
   AND NOT EXISTS (SELECT 1 FROM org_memberships o
                    WHERE o.org_id = m.org_id AND o.role IN ('owner', 'admin') AND o.is_active);
