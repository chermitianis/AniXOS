-- ============================================================================
-- 0012_planning.sql
-- المخطط: يربط (عامل + آلة + مهمة/قطعة + موعد) — عند دخول العامل للكشك،
-- إن وُجد له سطر في هذا الجدول لنفس اليوم، تُعبَّأ حقول السياق تلقائياً.
-- ============================================================================

create table if not exists planning (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,

  worker_id       uuid not null references workers(id) on delete cascade,
  machine_id      uuid references machines(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  piece_task_id   uuid references pieces_tasks(id) on delete set null,

  planned_date    date not null,
  shift_start     time not null,
  shift_end       time not null,

  notes           text,

  status          text not null default 'scheduled'
                  check (status in ('scheduled', 'in_progress', 'done', 'cancelled')),

  created_by      uuid references staff_users(id) on delete set null,  -- المشرف الذي أنشأ التخصيص
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table planning is 'جدول توزيع المهام اليومي/الأسبوعي؛ يغذّي واجهة الكشك تلقائياً عند دخول العامل';

create index if not exists idx_planning_company_date on planning (company_id, planned_date);
create index if not exists idx_planning_worker_date on planning (worker_id, planned_date);

create trigger trg_planning_updated_at
before update on planning
for each row execute function set_updated_at();
