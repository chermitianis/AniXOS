-- ============================================================================
-- 0060_platform_settings.sql
-- جدول إعدادات المنصة (singleton) + حماية RLS
--
-- يُستخدم لتخزين:
--   - العملة (TND, USD, EUR, SAR, ...)
--   - أسعار الخطط (Standard / Premium × شهرية / سنوية)
--   - مدة التجربة المجانية (بالأيام)
--
-- القيم الأولية = 0 (يُعدّلها المطور لاحقًا من لوحة المطور).
--
-- RLS:
--   - SELECT: كل مصادَق (لأن SubscriptionPage تحتاج قراءة الأسعار).
--   - UPDATE: المطور حصريًا (is_developer()).
--   - INSERT/DELETE: محظور (singleton، يُنشأ عبر migration).
-- ============================================================================

-- ============================================================================
-- 1) الجدول
-- ============================================================================
create table if not exists platform_settings (
  id                          uuid primary key default gen_random_uuid(),

  -- العملة المعروضة (ISO 4217: TND, USD, EUR, SAR, AED, MAD, DZD, EGP, ...)
  currency                    text not null default 'TND',

  -- مدة التجربة المجانية (بالأيام) — تُستخدم في الإحصاءات والعرض
  trial_days                  integer not null default 60 check (trial_days > 0),

  -- أسعار الخطط (0 = غير مُحدَّد بعد، يُعدّله المطور)
  standard_monthly_price      numeric(12,2) not null default 0 check (standard_monthly_price >= 0),
  standard_yearly_price       numeric(12,2) not null default 0 check (standard_yearly_price >= 0),
  premium_monthly_price       numeric(12,2) not null default 0 check (premium_monthly_price >= 0),
  premium_yearly_price        numeric(12,2) not null default 0 check (premium_yearly_price >= 0),

  -- حدود الخطط (للاستخدام المستقبلي عند فرض القيود)
  standard_max_databases      integer not null default 3 check (standard_max_databases > 0),
  standard_max_staff          integer not null default 20 check (standard_max_staff > 0),
  premium_max_databases       integer not null default 5 check (premium_max_databases > 0),
  premium_max_staff           integer not null default 50 check (premium_max_staff > 0),

  -- ملاحظات إدارية (اختياري)
  admin_notes                 text,

  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references auth.users(id) on delete set null
);

comment on table platform_settings is
  'جدول singleton لإعدادات المنصة (العملة، الأسعار، المدد). صف واحد فقط — يُنشأ عبر migration ويُحدَّث من لوحة المطور.';

-- ============================================================================
-- 2) Trigger updated_at
-- ============================================================================
create trigger trg_platform_settings_updated_at
before update on platform_settings
for each row execute function set_updated_at();

-- ============================================================================
-- 3) إنشاء الصف الوحيد (singleton) — idempotent
-- ============================================================================
-- نستخدم UUID ثابت لتسهيل الرجوع إليه من الكود (لا يحتاج SELECT أولًا).
insert into platform_settings (id, currency, trial_days)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'TND', 60)
on conflict (id) do nothing;

-- ============================================================================
-- 4) Trigger: منع INSERT لصفوف إضافية (singleton)
-- ============================================================================
create or replace function tg_platform_settings_singleton()
returns trigger
language plpgsql
as $$
begin
  -- نسمح بالصف الوحيد فقط (UUID ثابت)
  if new.id <> '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'platform_settings_singleton_only';
  end if;
  -- نمنع أكثر من صف واحد
  if (select count(*) from platform_settings) >= 1 and tg_op = 'INSERT' then
    raise exception 'platform_settings_singleton_only';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_platform_settings_singleton on platform_settings;
create trigger trg_platform_settings_singleton
before insert on platform_settings
for each row execute function tg_platform_settings_singleton();

-- ============================================================================
-- 5) RLS
-- ============================================================================
alter table platform_settings enable row level security;

-- SELECT: كل مصادَق (SubscriptionPage يقرأ الأسعار للعرض)
drop policy if exists platform_settings_select on platform_settings;
create policy platform_settings_select on platform_settings
  for select to authenticated
  using (true);

-- UPDATE: المطور حصريًا
drop policy if exists platform_settings_update_developer on platform_settings;
create policy platform_settings_update_developer on platform_settings
  for update to authenticated
  using (is_developer())
  with check (is_developer());

-- INSERT/DELETE: محظور (الصف يُنشأ عبر migration)
-- (لا سياسة = لا صلاحية)

-- ============================================================================
-- 6) RPC: جلب إعدادات المنصة (لتُستدعى من الواجهة بسهولة)
-- ============================================================================
create or replace function get_platform_settings()
returns table (
  currency text,
  trial_days integer,
  standard_monthly_price numeric,
  standard_yearly_price numeric,
  premium_monthly_price numeric,
  premium_yearly_price numeric,
  standard_max_databases integer,
  standard_max_staff integer,
  premium_max_databases integer,
  premium_max_staff integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ps.currency,
    ps.trial_days,
    ps.standard_monthly_price,
    ps.standard_yearly_price,
    ps.premium_monthly_price,
    ps.premium_yearly_price,
    ps.standard_max_databases,
    ps.standard_max_staff,
    ps.premium_max_databases,
    ps.premium_max_staff,
    ps.updated_at
  from platform_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000001'::uuid;
$$;

revoke all on function get_platform_settings() from public;
grant execute on function get_platform_settings() to authenticated;

-- ============================================================================
-- 7) NOTIFY PostgREST
-- ============================================================================
notify pgrst, 'reload schema';