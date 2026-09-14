-- ============================================================================
-- 0002_roles_permissions.sql
-- الأدوار: قوالب نظام ثابتة (system) + إمكانية تخصيص أدوار إضافية لكل شركة
-- الصلاحيات مخزنة كـ JSONB مرن: { "module": ["view","edit","delete",...] }
-- ============================================================================

create table if not exists roles (
  id            uuid primary key default gen_random_uuid(),

  -- company_id = NULL يعني "قالب نظام" متاح لكل الشركات (Owner, Supervisor..)
  -- company_id محدد يعني دور مخصص أنشأته شركة معينة لنفسها
  company_id    uuid references companies(id) on delete cascade,

  code          text not null,                 -- معرف ثابت يستخدمه الكود: 'owner','supervisor'...
  name          text not null,                 -- الاسم المعروض
  is_system     boolean not null default false,
  permissions   jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- لا يجوز تكرار نفس كود الدور مرتين لنفس الشركة (لأدوار الشركات المخصصة فقط)
  unique (company_id, code)
);

-- تنبيه مهم: قيد UNIQUE أعلاه لا يمنع تكرار الأكواد بين صفوف company_id = NULL
-- لأن PostgreSQL يعتبر كل NULL مختلفاً عن الآخر. لذلك نضيف فهرساً جزئياً صريحاً
-- يضمن عدم تكرار "code" ضمن قوالب النظام (حيث company_id IS NULL) تحديداً.
create unique index if not exists roles_system_code_uidx
  on roles (code)
  where company_id is null;

comment on table roles is 'أدوار الموظفين وصلاحياتهم؛ NULL في company_id = قالب نظام عام';

create trigger trg_roles_updated_at
before update on roles
for each row execute function set_updated_at();

-- ------------------------------------------------------------------
-- قوالب الأدوار الافتراضية للنظام (متاحة تلقائياً لكل شركة جديدة)
-- ------------------------------------------------------------------
insert into roles (company_id, code, name, is_system, permissions) values
(null, 'owner', 'المدير العام / المالك', true,
  '{"all": ["view","create","edit","delete","approve"]}'::jsonb),

(null, 'supervisor', 'رئيس الورشة', true,
  '{"planning": ["view","create","edit"],
    "shop_floor": ["view","edit"],
    "workers": ["view"],
    "machines": ["view","edit"]}'::jsonb),

(null, 'engineering', 'الهندسة والمشاريع', true,
  '{"projects": ["view","create","edit"],
    "pieces_tasks": ["view","create","edit"],
    "task_types": ["view","create","edit"]}'::jsonb),

(null, 'accounting', 'المحاسبة والمالية', true,
  '{"accounting": ["view","create","edit"],
    "sales": ["view","create","edit"],
    "reports": ["view"]}'::jsonb),

(null, 'hr', 'الموارد البشرية', true,
  '{"workers": ["view","create","edit","delete"],
    "staff_users": ["view","create","edit"]}'::jsonb)

on conflict (code) where company_id is null do nothing;
