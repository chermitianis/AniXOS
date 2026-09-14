-- ============================================================================
-- 0028_subscription_trial.sql
-- نموذج SaaS: كل شركة جديدة تحصل تلقائياً على فترة تجريبية 3 أشهر من لحظة
-- إنشائها. بعدها تحتاج اشتراكاً مدفوعاً (subscription_plan = 'active')
-- لمواصلة الاستخدام — لكن بياناتها تبقى محفوظة بالكامل مهما طالت مدة
-- التوقف (لا حذف، فقط منع الوصول على مستوى التطبيق).
--
-- حساب المطور (chermitti.aniss9@gmail.com) مستثنى بالكامل من كل هذا —
-- يُعامَل دائماً كأنه مشترك نشط، بغض النظر عن تاريخ الفترة التجريبية.
-- ============================================================================

alter table companies
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '3 months'),
  add column if not exists is_developer_account boolean not null default false;

comment on column companies.trial_ends_at is 'نهاية الفترة التجريبية المجانية (3 أشهر من الإنشاء تلقائياً)';
comment on column companies.is_developer_account is 'true لحساب مطور المنصة حصراً؛ يُستثنى من كل قيود الاشتراك';

-- ------------------------------------------------------------------
-- RPC: حالة اشتراك الشركة الحالية (تُستدعى من الواجهة عند كل دخول)
-- ------------------------------------------------------------------
create or replace function get_company_subscription_status()
returns table (
  company_id uuid,
  status text,               -- 'developer' | 'trial_active' | 'trial_expired' | 'active' | 'suspended' | 'cancelled'
  trial_ends_at timestamptz,
  days_remaining integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    case
      when c.is_developer_account then 'developer'
      when c.subscription_plan = 'active' then 'active'
      when c.subscription_plan = 'suspended' then 'suspended'
      when c.subscription_plan = 'cancelled' then 'cancelled'
      when c.subscription_plan = 'trial' and c.trial_ends_at > now() then 'trial_active'
      else 'trial_expired'
    end,
    c.trial_ends_at,
    greatest(0, ceil(extract(epoch from (c.trial_ends_at - now())) / 86400))::integer
  from companies c
  where c.id = get_my_company_id();
$$;

comment on function get_company_subscription_status() is
  'يُرجع حالة اشتراك شركة المستخدم الحالي؛ الواجهة تستخدمها لعرض شاشة "يتطلب اشتراكاً" عند الانتهاء';

revoke all on function get_company_subscription_status() from public;
grant execute on function get_company_subscription_status() to authenticated;
