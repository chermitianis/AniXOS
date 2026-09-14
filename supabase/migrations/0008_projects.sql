-- ============================================================================
-- 0008_projects.sql
-- المشاريع: الوحدة المركزية التي تُبنى حولها كل عمليات التصنيع والتكلفة
-- ============================================================================

create table if not exists projects (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  client_id           uuid references clients(id) on delete set null,

  name                text not null,
  code                text not null,             -- كود المشروع الظاهر في واجهة الـ Kiosk
  description         text,

  status              text not null default 'planned'
                      check (status in ('planned', 'in_progress', 'on_hold', 'completed', 'cancelled')),

  -- القيم التقديرية (تُقارَن لاحقاً بالفعلي المستخرج من work_sessions)
  estimated_hours     numeric(10,2),
  estimated_cost      numeric(14,2),
  quoted_price        numeric(14,2),              -- السعر المتفق عليه مع العميل

  start_date          date,
  due_date             date,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (company_id, code)
);

comment on table projects is 'المشاريع الميكانيكية؛ الأساس لحساب فوارق الوقت/التكلفة وصافي الربح';

create index if not exists idx_projects_company on projects (company_id);
create index if not exists idx_projects_client on projects (client_id);
create index if not exists idx_projects_status on projects (company_id, status);

create trigger trg_projects_updated_at
before update on projects
for each row execute function set_updated_at();
