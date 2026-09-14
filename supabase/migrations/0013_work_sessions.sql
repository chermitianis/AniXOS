-- ============================================================================
-- 0013_work_sessions.sql
-- كل ضغطة على بطاقة (مهمة إنتاجية أو سبب توقف) في الكشك تُنشئ سطراً هنا.
-- هذا الجدول هو مصدر الحقيقة لحساب: الوقت الفعلي، فوارق الوقت/التكلفة،
-- وصافي الربح لكل مشروع في لوحة المدير.
-- ============================================================================

create table if not exists work_sessions (
  -- ملاحظة: id قابل للتزويد من العميل (Client-Supplied UUID) عمداً، لأن
  -- الجلسات قد تُنشأ محلياً أثناء انقطاع الإنترنت (Dexie/IndexedDB) ثم
  -- تُزامَن لاحقاً بنفس المعرّف تفادياً لتكرار السجل عند إعادة المحاولة.
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,

  worker_id       uuid not null references workers(id) on delete cascade,
  machine_id      uuid references machines(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  piece_task_id   uuid references pieces_tasks(id) on delete set null,
  planning_id     uuid references planning(id) on delete set null,

  session_type    text not null check (session_type in ('production', 'downtime')),
  task_type_id    uuid references task_types(id) on delete set null,
  stop_reason_id  uuid references stop_reasons(id) on delete set null,
  note            text,                          -- ملاحظة إجبارية لبعض أسباب التوقف

  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  duration_seconds integer,                       -- تُحسب تلقائياً عبر Trigger عند الإغلاق

  -- مصدر إنشاء السجل: هل جاء مباشرة أونلاين أم من طابور مزامنة أوفلاين
  source          text not null default 'online' check (source in ('online', 'offline_sync')),

  created_at      timestamptz not null default now(),

  -- تناسق منطقي: مهمة إنتاجية تتطلب task_type ولا تقبل stop_reason، والعكس
  constraint chk_session_type_consistency check (
    (session_type = 'production' and task_type_id is not null and stop_reason_id is null)
    or
    (session_type = 'downtime' and stop_reason_id is not null and task_type_id is null)
  )
);

comment on table work_sessions is 'سجل كل جلسة عمل/توقف؛ المصدر الأساسي لحساب التكلفة الفعلية وصافي الربح';

create index if not exists idx_work_sessions_company on work_sessions (company_id);
create index if not exists idx_work_sessions_worker on work_sessions (worker_id, started_at);
create index if not exists idx_work_sessions_project on work_sessions (project_id);

-- عامل واحد لا يمكن أن يملك أكثر من جلسة "مفتوحة" (لم تنتهِ بعد) في نفس اللحظة
create unique index if not exists idx_work_sessions_one_open_per_worker
  on work_sessions (worker_id)
  where ended_at is null;

-- حساب duration_seconds تلقائياً عند إغلاق الجلسة (تعبئة ended_at)
create or replace function compute_session_duration()
returns trigger as $$
begin
  if new.ended_at is not null then
    new.duration_seconds := extract(epoch from (new.ended_at - new.started_at))::integer;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_work_sessions_duration
before insert or update on work_sessions
for each row execute function compute_session_duration();
