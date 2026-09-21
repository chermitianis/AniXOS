-- ============================================================================
-- 0059_accounts_and_databases.sql
-- المرحلة 1 من "نظام الاشتراكات والحسابات المتعددة" — الأساس المعماري فقط.
--
-- ⚠️ يُبنى هذا فوق بنية تحتية موجودة فعلياً وليس من الصفر:
--   - companies.trial_ends_at / subscription_plan / is_developer_account
--     (migration 0028) — نظام تجربة/اشتراك يعمل حالياً على مستوى الشركة.
--   - get_company_subscription_status() + SubscriptionGate.tsx (يعملان الآن).
--   - tenant-provisioning Edge Function = "التسجيل" الحالي (شركة واحدة فقط).
-- بما أن الاشتراك الجديد يصبح على مستوى الحساب (account) لا الشركة (يُغطي
-- حتى 5 قواعد بيانات بنفس الاشتراك)، ننقل هذه الحقول إلى accounts مع ترحيل
-- كامل للبيانات الحالية (بلا فقدان أي حالة اشتراك أو تجربة قائمة)، ونُبقي
-- get_company_subscription_status() بنفس التوقيع (0 تعديل على SubscriptionGate.tsx)
-- عبر قراءة مزدوجة: accounts إن وُجد ربط، وإلا تراجع لحقول companies القديمة
-- (حالة انتقالية فقط: شركات تُنشأ عبر tenant-provisioning قبل نشر المرحلة 2).
--
-- ⚠️ تعارض معماري حرج تم اكتشافه وحله هنا: staff_users.id كان هو نفسه
-- auth.users.id (علاقة 1↔1 صارمة عبر PK+FK معاً) — يمنع فيزيائياً وجود أكثر
-- من قاعدة بيانات (company) واحدة لنفس البريد الإلكتروني. الحل: فصل الهوية
-- (auth_user_id، عمود جديد) عن المعرّف الأساسي (id، يبقى بنفس القيم الحالية
-- لكل الصفوف الموجودة — كل المفاتيح الأجنبية القائمة تبقى صالحة بلا أي تغيير).
--
-- ⚠️ ترتيب التنفيذ الحرج: التريغر الحامي `tg_accounts_protect_sensitive_fields`
-- يُنشأ في النهاية (القسم 11) بعد كل التعديلات الحساسة على `accounts`، لأن
-- الـtrigger يمنع تعديل `is_developer`/`subscription_status`/`plan`/إلخ من أي
-- سياق غير service_role/is_developer. أثناء migration (psql)، لا يوجد سياق
-- auth، لذا أي UPDATE على هذه الحقول يجب أن يسبق إنشاء الـtrigger.
-- ============================================================================

-- ============================================================================
-- 1) جدول accounts
-- ============================================================================
create table if not exists accounts (
  id                      uuid primary key references auth.users(id) on delete cascade,
  email                   text not null unique,

  owner_full_name         text not null,
  phone                   text,
  address                 text,

  is_developer            boolean not null default false,

  subscription_status     text not null default 'trial'
                          check (subscription_status in ('trial', 'active', 'expired', 'suspended', 'cancelled')),
  plan                    text not null default 'trial'
                          check (plan in ('trial', 'standard', 'premium')),
  billing_cycle           text check (billing_cycle in ('monthly', 'yearly')),

  trial_ends_at           timestamptz not null default (now() + interval '60 days'),
  current_period_end      timestamptz,

  paddle_customer_id      text,
  paddle_subscription_id  text,

  admin_notes             text,
  suspended_by_admin      boolean not null default false,

  max_databases           integer not null default 5,

  -- القاعدة النشطة حالياً لهذا المستخدم (تُحدَّث عبر set_active_company عند
  -- التبديل من قائمة القواعد) — أساس حل مشكلة "أي company_id تخص هذا الطلب"
  -- دون أي تعديل على get_my_company_id() في أي سياسة RLS قائمة.
  active_company_id       uuid references companies(id) on delete set null,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table accounts is 'حساب المستخدم على مستوى المنصة (بريد واحد) — يملك حتى max_databases قاعدة بيانات (companies) معزولة، باشتراك واحد مشترك بينها جميعاً';
comment on column accounts.active_company_id is 'القاعدة/الشركة النشطة حالياً لهذا المستخدم — تُحدَّث عبر set_active_company()، تُستخدم داخل get_my_company_id() لحل الغموض عند تعدد القواعد';

create trigger trg_accounts_updated_at
before update on accounts
for each row execute function set_updated_at();

-- ============================================================================
-- 2) جدول databases
-- ============================================================================
create table if not exists databases (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (account_id, name),
  unique (account_id, company_id),
  unique (company_id)  -- شركة واحدة لا يمكن أن تنتمي لأكثر من قاعدة/حساب
);

comment on table databases is 'ربط منطقي بين حساب (account) وقاعدة بيانات معزولة (company) — صف واحد لكل قاعدة يملكها الحساب، بحد أقصى accounts.max_databases';

create trigger trg_databases_updated_at
before update on databases
for each row execute function set_updated_at();

create index if not exists idx_databases_account on databases (account_id);

-- تريغر: منع تجاوز max_databases عند الإدراج
create or replace function tg_databases_check_limit()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
  allowed integer;
begin
  select count(*) into current_count from databases where account_id = new.account_id;
  select max_databases into allowed from accounts where id = new.account_id;
  if current_count >= coalesce(allowed, 5) then
    raise exception 'database_limit_reached' using
      hint = format('Ce compte a atteint sa limite de %s bases de données.', coalesce(allowed, 5));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_databases_check_limit on databases;
create trigger trg_databases_check_limit
before insert on databases
for each row execute function tg_databases_check_limit();

-- ============================================================================
-- 3) جدول account_events (سجل تدقيق — قسم 12.6)
-- ============================================================================
create table if not exists account_events (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  event_type    text not null,  -- created | suspended | unsuspended | deleted | plan_changed | payment | trial_extended | note_added
  event_data    jsonb not null default '{}'::jsonb,
  performed_by  text,           -- 'system' | 'developer' | 'paddle_webhook' | بريد المطور الذي نفّذ الإجراء
  created_at    timestamptz not null default now()
);

comment on table account_events is 'سجل تدقيق لكل حدث مهم على حساب: إنشاء، تعليق، تغيير خطة، دفعة... تُغذّيه لوحة المطور والـEdge Functions';

create index if not exists idx_account_events_account on account_events (account_id, created_at desc);

-- ============================================================================
-- 4) تعديل companies: ربط بالحساب المالك
-- ============================================================================
alter table companies
  add column if not exists account_id uuid references accounts(id) on delete set null;

create index if not exists idx_companies_account on companies (account_id);

-- ============================================================================
-- 5) إعادة هيكلة staff_users — فصل id عن auth_user_id (التعارض الحرج)
-- ============================================================================
alter table staff_users add column if not exists auth_user_id uuid;
update staff_users set auth_user_id = id where auth_user_id is null;
alter table staff_users alter column auth_user_id set not null;

alter table staff_users add column if not exists account_id uuid references accounts(id) on delete set null;

-- إسقاط الـFK القديم الذي كان يجعل id = auth.users(id) إلزامياً (اسم القيد
-- الافتراضي الذي تولّده Postgres لقيد PK+REFERENCES معاً في نفس السطر)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'staff_users' and constraint_name = 'staff_users_id_fkey'
  ) then
    alter table staff_users drop constraint staff_users_id_fkey;
  end if;
end $$;

alter table staff_users alter column id set default gen_random_uuid();
alter table staff_users add constraint staff_users_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_users_company_auth_unique'
  ) then
    alter table staff_users add constraint staff_users_company_auth_unique unique (company_id, auth_user_id);
  end if;
end $$;

create index if not exists idx_staff_users_auth_user on staff_users (auth_user_id);

comment on column staff_users.id is 'معرّف الصف الخاص به (مستقل عن auth.users منذ 0059) — تبقى قيمه الحالية كما هي لكل الصفوف الموجودة قبل هذه الهجرة، فكل المفاتيح الأجنبية القائمة تبقى صالحة';
comment on column staff_users.auth_user_id is 'معرّف هوية Supabase Auth الفعلي — قد يتكرر عبر عدة صفوف (شركات) لنفس المالك متعدد القواعد؛ هذا هو العمود الصحيح للمقارنة مع auth.uid()';

-- ============================================================================
-- 6) الدوال المركزية — CREATE OR REPLACE بنفس التوقيع، صفر تعديل على أي
--    سياسة RLS قائمة أو أي كود Frontend يستدعيها بالاسم
-- ============================================================================

-- get_my_company_id(): الأساس المطلق لكل عزل RLS في النظام. يحل الآن الغموض
-- عند تعدد القواعد عبر accounts.active_company_id (مع تحقق عضوية صارم)، ويبقى
-- بالسلوك القديم تماماً (صف staff_users الوحيد) لكل مستخدم بقاعدة واحدة —
-- أي 100% من المستخدمين الحاليين + كل الموظفين مستقبلاً بلا استثناء.
create or replace function get_my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select su.company_id
      from accounts a
      join staff_users su
        on su.company_id = a.active_company_id
       and su.auth_user_id = auth.uid()
       and su.is_active
      where a.id = auth.uid() and a.active_company_id is not null
    ),
    (select company_id from staff_users where auth_user_id = auth.uid() and is_active order by created_at limit 1),
    (select company_id from devices where auth_user_id = auth.uid())
  );
$$;

-- is_my_company_owner(): نفس المنطق القديم تماماً، فقط auth_user_id بدل id
create or replace function is_my_company_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_users
    where auth_user_id = auth.uid()
      and company_id = target_company_id
      and is_owner = true
      and is_active = true
  );
$$;

-- get_company_subscription_status(): تقرأ من accounts إن وُجد ربط، وإلا
-- تتراجع لحقول companies القديمة (شركات لم تُرحَّل بعد عبر tenant-provisioning
-- القديمة قبل نشر المرحلة 2) — SubscriptionGate.tsx يبقى بلا أي تعديل.
create or replace function get_company_subscription_status()
returns table (
  company_id uuid,
  status text,
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
      when a.is_developer or c.is_developer_account then 'developer'
      when a.id is not null and a.subscription_status = 'active' then 'active'
      when a.id is not null and a.subscription_status = 'suspended' then 'suspended'
      when a.id is not null and a.subscription_status = 'cancelled' then 'cancelled'
      when a.id is not null and a.subscription_status = 'trial' and a.trial_ends_at > now() then 'trial_active'
      when a.id is not null then 'trial_expired'
      when c.subscription_plan = 'active' then 'active'
      when c.subscription_plan = 'suspended' then 'suspended'
      when c.subscription_plan = 'cancelled' then 'cancelled'
      when c.subscription_plan = 'trial' and c.trial_ends_at > now() then 'trial_active'
      else 'trial_expired'
    end,
    coalesce(a.trial_ends_at, c.trial_ends_at),
    greatest(0, ceil(extract(epoch from (coalesce(a.trial_ends_at, c.trial_ends_at) - now())) / 86400))::integer
  from companies c
  left join accounts a on a.id = c.account_id
  where c.id = get_my_company_id();
$$;

-- get_my_account_id(): مجرد alias صريح لـauth.uid()، مطابق للمواصفات (4.6)
create or replace function get_my_account_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- is_developer(): تُستخدم لحماية /developer-panel ولوحة المطور مستقبلاً
create or replace function is_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_developer from accounts where id = auth.uid()), false);
$$;

-- list_my_databases(): قائمة القواعد المتاحة لهذا المستخدم (مالكاً أو موظفاً)
create or replace function list_my_databases()
returns table (
  database_id uuid,
  company_id uuid,
  company_name text,
  database_name text,
  is_owner boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.company_id, c.name, d.name, bool_or(su.is_owner)
  from databases d
  join companies c on c.id = d.company_id
  join staff_users su
    on su.company_id = d.company_id
   and su.auth_user_id = auth.uid()
   and su.is_active
  group by d.id, d.company_id, c.name, d.name
  order by d.created_at;
$$;

-- set_active_company(): يُستدعى عند اختيار قاعدة من القائمة — يتحقق من
-- العضوية الفعلية قبل أي تحديث (لا يمكن انتحال قاعدة لا يملكها المستخدم)
create or replace function set_active_company(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from staff_users
    where auth_user_id = auth.uid() and company_id = target_company_id and is_active
  ) then
    raise exception 'not_a_member_of_this_company';
  end if;

  update accounts set active_company_id = target_company_id, updated_at = now() where id = auth.uid();
  -- إن لم يملك المستخدم صف accounts (موظف عادي، وليس مالك حساب) — لا شيء
  -- يتغيّر هنا، وهذا متوقع وآمن: get_my_company_id() يحل حالته عبر staff_users مباشرة
end;
$$;

revoke all on function get_my_company_id() from public;
revoke all on function is_my_company_owner(uuid) from public;
revoke all on function get_company_subscription_status() from public;
revoke all on function get_my_account_id() from public;
revoke all on function is_developer() from public;
revoke all on function list_my_databases() from public;
revoke all on function set_active_company(uuid) from public;

grant execute on function get_my_company_id() to authenticated;
grant execute on function is_my_company_owner(uuid) to authenticated;
grant execute on function get_company_subscription_status() to authenticated;
grant execute on function get_my_account_id() to authenticated;
grant execute on function is_developer() to authenticated;
grant execute on function list_my_databases() to authenticated;
grant execute on function set_active_company(uuid) to authenticated;

-- ============================================================================
-- 7) تصحيح سياسات RLS القائمة التي كانت تقارن staff_users.id مباشرةً مع
--    auth.uid() (نمط قديم غير متوافق بعد فصل id عن auth_user_id) — odoo_config فقط
-- ============================================================================
drop policy if exists odoo_config_select on odoo_config;
create policy odoo_config_select on odoo_config
  for select using (
    exists (
      select 1 from staff_users
      where staff_users.auth_user_id = auth.uid()
        and staff_users.company_id = odoo_config.company_id
        and staff_users.is_owner = true
    )
  );

drop policy if exists odoo_config_insert on odoo_config;
create policy odoo_config_insert on odoo_config
  for insert with check (
    exists (
      select 1 from staff_users
      where staff_users.auth_user_id = auth.uid()
        and staff_users.company_id = odoo_config.company_id
        and staff_users.is_owner = true
    )
  );

drop policy if exists odoo_config_update on odoo_config;
create policy odoo_config_update on odoo_config
  for update using (
    exists (
      select 1 from staff_users
      where staff_users.auth_user_id = auth.uid()
        and staff_users.company_id = odoo_config.company_id
        and staff_users.is_owner = true
    )
  );

-- ============================================================================
-- 8) RLS على الجداول الجديدة (بدون الـtrigger الحامي بعد — سيُنشأ في القسم 11)
-- ============================================================================
alter table accounts enable row level security;
alter table databases enable row level security;
alter table account_events enable row level security;

-- accounts: يرى المستخدم حسابه فقط، أو كل شيء إن كان مطوراً
create policy accounts_select on accounts
  for select using (id = auth.uid() or is_developer());

-- تعديل ذاتي محدود: الحقول الحساسة محمية بتريغر (القسم 11) — هنا سياسة UPDATE
-- عامة، والتريغر سيُدقّق لاحقاً في أي حقل يُعدَّل فعلياً.
create policy accounts_update on accounts
  for update using (id = auth.uid() or is_developer());

-- لا INSERT/DELETE لـauthenticated إطلاقاً: فقط عبر Edge Functions
-- (service_role يتجاوز RLS بالكامل، فلا حاجة لسياسة صريحة هنا)

-- databases: يرى المالك قواعده فقط، أو كل شيء إن كان مطوراً
create policy databases_select on databases
  for select using (account_id = auth.uid() or is_developer());

-- account_events: المطوّر فقط (سجل تدقيق داخلي، لا يراه صاحب الحساب حالياً)
create policy account_events_select on account_events
  for select using (is_developer());

-- ============================================================================
-- 9) الترحيل: بيانات كل شركة موجودة تُصبح "حساباً" بقاعدة واحدة، بلا فقدان
--    أي حالة اشتراك/تجربة قائمة فعلياً
-- ============================================================================
do $$
declare
  co record;
  owner_row record;
  new_account_id uuid;
  mapped_status text;
  mapped_plan text;
begin
  for co in select * from companies where account_id is null loop
    -- أول مالك نشط لهذه الشركة (المفروض واحداً فقط في التصميم الحالي)
    select * into owner_row
    from staff_users
    where company_id = co.id and is_owner = true
    order by created_at
    limit 1;

    if owner_row.id is null then
      raise notice 'شركة % بلا مالك — تخطّي الترحيل، تحتاج مراجعة يدوية', co.id;
      continue;
    end if;

    -- تعيين الحساب الذي سيُنشأ لهذه الشركة، بريده هو بريد المالك
    new_account_id := owner_row.auth_user_id;

    mapped_status := case
      when co.is_developer_account then 'active'
      when co.subscription_plan = 'active' then 'active'
      when co.subscription_plan = 'suspended' then 'suspended'
      when co.subscription_plan = 'cancelled' then 'cancelled'
      else 'trial'
    end;
    mapped_plan := case when co.is_developer_account or co.subscription_plan = 'active' then 'premium' else 'trial' end;

    insert into accounts (
      id, email, owner_full_name, phone, is_developer,
      subscription_status, plan, trial_ends_at, max_databases, active_company_id
    ) values (
      new_account_id, owner_row.email, owner_row.full_name, owner_row.phone, co.is_developer_account,
      mapped_status, mapped_plan, co.trial_ends_at,
      case when co.is_developer_account then 999 else 5 end,
      co.id
    )
    on conflict (id) do nothing;

    if not exists (select 1 from accounts where id = new_account_id) then
      raise notice 'تعذّر إنشاء account للشركة % (بريد % مستخدم في حساب آخر مسبقاً) — تحتاج مراجعة يدوية', co.id, owner_row.email;
      continue;
    end if;

    insert into databases (account_id, company_id, name)
    values (new_account_id, co.id, co.name)
    on conflict do nothing;

    update companies set account_id = new_account_id where id = co.id;
    update staff_users set account_id = new_account_id where company_id = co.id;
  end loop;
end $$;

-- ============================================================================
-- 10) حساب مطوّر المنصة: تأكيد صريح (ينفَّذ قبل إنشاء الـtrigger الحامي)
-- ============================================================================
-- ملاحظة الترتيب: هذا UPDATE يُعدِّل `is_developer` (حقل حساس)، فيجب أن يسبق
-- إنشاء الـtrigger الحامي في القسم 11. بعد الترقية، الـtrigger سيحمي الحقل
-- ضد أي تعديل من سياقات غير service_role/is_developer.
update accounts
set is_developer = true,
    subscription_status = 'active',
    plan = 'premium',
    max_databases = 999
where id in (select id from auth.users where lower(email) = 'chermitti.aniss9@gmail.com')
  and not is_developer;

-- ============================================================================
-- 11) الـtrigger الحامي — يُنشأ الآن بعد كل التعديلات الحساسة على `accounts`
-- ============================================================================
create or replace function tg_accounts_protect_sensitive_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' or is_developer() then
    return new;
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.plan is distinct from old.plan
     or new.is_developer is distinct from old.is_developer
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.suspended_by_admin is distinct from old.suspended_by_admin
     or new.max_databases is distinct from old.max_databases
     or new.paddle_customer_id is distinct from old.paddle_customer_id
     or new.paddle_subscription_id is distinct from old.paddle_subscription_id
  then
    raise exception 'sensitive_account_fields_are_protected';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_accounts_protect_sensitive_fields on accounts;
create trigger trg_accounts_protect_sensitive_fields
before update on accounts
for each row execute function tg_accounts_protect_sensitive_fields();

-- ============================================================================
-- 12) NOTIFY PostgREST
-- ============================================================================
notify pgrst, 'reload schema';

-- ============================================================================
-- 13) COMMENT نهائي
-- ============================================================================
comment on function tg_databases_check_limit() is 'يمنع إنشاء قاعدة بيانات جديدة إن كان الحساب قد بلغ سقف max_databases';