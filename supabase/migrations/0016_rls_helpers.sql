-- ============================================================================
-- 0016_rls_helpers.sql
-- الدالة المركزية لتحديد company_id الخاص بالجلسة الحالية.
-- تدعم حالتين:
--   1) موظف إداري مسجل دخول عبر Supabase Auth العادي  → staff_users
--   2) جهاز Kiosk له حساب Auth مخصص دائم               → devices
-- SECURITY DEFINER تجعل الدالة تُنفَّذ بصلاحيات مالك الجدول (تتجاوز RLS
-- الخاص بـ staff_users/devices نفسيهما)، وهذا آمن لأنها لا تُرجع سوى
-- company_id واحد مرتبط حصرياً بـ auth.uid() الحالي.
-- ============================================================================

create or replace function get_my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from staff_users where id = auth.uid()
  union
  select company_id from devices where auth_user_id = auth.uid()
  limit 1;
$$;

comment on function get_my_company_id() is 'يُرجع company_id للمستخدم/الجهاز الحالي؛ الأساس المركزي لكل سياسات RLS في النظام';

revoke all on function get_my_company_id() from public;
grant execute on function get_my_company_id() to authenticated;
