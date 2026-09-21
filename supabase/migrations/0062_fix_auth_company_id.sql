-- ============================================================================
-- 0062_fix_auth_company_id.sql
--
-- الغرض: توحيد get_auth_company_id مع get_my_company_id
--
-- المشكلة:
--   get_auth_company_id() كانت تستخدم:
--       staff_users.id = auth.uid()
--   بينما get_my_company_id() تستخدم:
--       staff_users.auth_user_id = auth.uid()
--
--   الفرق حاسم: عندما يُضاف موظف جديد (is_owner = false)،
--   staff_users.id لن يساوي auth.uid() أبدًا (UUID جديد auto-generated).
--   النتيجة: RLS على roles و workers تفشل بصمت → تسريب محتمل.
--
-- الحل: توحيد الدالة على auth_user_id + دعم accounts.active_company_id
--       (نفس منطق get_my_company_id) لضمان اتساق كامل.
--
-- الأثر: آمن 100% لأن النظام الحالي فيه is_owner = true فقط (لا staff).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- استبدال get_auth_company_id بنسخة موحّدة
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    -- 1) المالك: يقرأ active_company_id من جدول accounts
    (
      SELECT a.active_company_id
      FROM accounts a
      WHERE a.id = auth.uid()
        AND a.active_company_id IS NOT NULL
    ),
    -- 2) الموظف: أول company_id في staff_users
    (
      SELECT su.company_id
      FROM staff_users su
      WHERE su.auth_user_id = auth.uid()
        AND su.is_active = true
      ORDER BY su.created_at
      LIMIT 1
    )
  );
$$;

COMMENT ON FUNCTION public.get_auth_company_id() IS
  'Returns the current active company_id for the authenticated user (owner via accounts.active_company_id, or staff via staff_users.auth_user_id). Mirrors get_my_company_id() logic.';

COMMIT;