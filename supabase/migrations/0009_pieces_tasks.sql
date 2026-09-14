-- ============================================================================
-- 0009_pieces_tasks.sql
-- القطعة/المهمة الميكانيكية ضمن مشروع: ما يظهر في حقل "PIÈCE" بواجهة الكشك
-- ============================================================================

create table if not exists pieces_tasks (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  project_id            uuid not null references projects(id) on delete cascade,

  name                  text not null,           -- اسم القطعة
  code                  text,                     -- كود القطعة الداخلي
  phase                 text,                     -- المرحلة التشغيلية (PHASE في الواجهة)
  drawing_url           text,                      -- رابط الرسم الفني

  estimated_time_minutes integer,                  -- الوقت التقديري (ESTIMATION في الواجهة)
  sequence_order        integer not null default 0,

  status                text not null default 'pending'
                        check (status in ('pending', 'in_progress', 'completed', 'cancelled')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table pieces_tasks is 'القطع/المهام الميكانيكية المرتبطة بمشروع؛ تغذّي حقول Pièce وEstimation في الكشك';

create index if not exists idx_pieces_tasks_company on pieces_tasks (company_id);
create index if not exists idx_pieces_tasks_project on pieces_tasks (project_id);

create trigger trg_pieces_tasks_updated_at
before update on pieces_tasks
for each row execute function set_updated_at();
