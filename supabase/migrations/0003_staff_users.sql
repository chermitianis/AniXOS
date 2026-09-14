-- ============================================================================
-- 0003_staff_users.sql
-- موظفو الشركة: حساب Auth حقيقي واحد لكل موظف، لكن كلهم ضمن نفس اشتراك الشركة
-- (وليس حساباً مدفوعاً منفصلاً لكل قسم كما في بعض أنظمة ERP التقليدية)
-- id الجدول = نفس id في auth.users (علاقة 1-إلى-1)
-- ============================================================================

create table if not exists staff_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  role_id       uuid not null references roles(id),

  full_name     text not null,
  email         text not null,
  phone         text,
  avatar_url    text,

  is_owner      boolean not null default false,  -- منشئ حساب الشركة الأول
  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (company_id, email)
);

comment on table staff_users is 'موظفو الشركة الإداريون (مدير، مشرف، محاسب...) بحسابات Auth حقيقية وأدوار محددة';

create index if not exists idx_staff_users_company on staff_users (company_id);

create trigger trg_staff_users_updated_at
before update on staff_users
for each row execute function set_updated_at();
