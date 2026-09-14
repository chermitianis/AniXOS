-- 0044_shifts_corrections_realtime.sql
-- ============================================================================
-- يعالج أربعة بنود من قائمة التحقق دفعة واحدة (مترابطة بنيوياً):
--   (5) الفصل بين الحصة (Shift) والحدث (Event)
--   (6) حد 3 أحداث نشطة بالتوازي للعامل الواحد (بدل قيد "جلسة واحدة فقط")
--   (9) سجل الأحداث والتصحيحات — تدقيق كامل بدل الحذف الفعلي
--   (10)(11) Passation مرتبطة بالحصة/المشروع + تفعيل Realtime الكامل
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) work_shifts: حصة/دوام العامل الفعلي (من تسجيل الدخول إلى تسجيل الخروج)
--    منفصلة تماماً عن work_sessions (التي تمثل الحدث: مهمة أو توقف داخل الحصة)
-- ----------------------------------------------------------------------------
create table if not exists work_shifts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  worker_id   uuid not null references workers(id) on delete cascade,
  device_id   uuid references devices(id) on delete set null,

  started_at  timestamptz not null default now(),
  ended_at    timestamptz,

  source      text not null default 'online' check (source in ('online', 'offline_sync')),
  created_at  timestamptz not null default now()
);

comment on table work_shifts is 'حصة/دوام العامل الفعلي: تبدأ بتسجيل الدخول وتنتهي فقط بتسجيل الخروج الصريح؛ منفصلة عن الأحداث (work_sessions) التي تحدث داخلها';

create index if not exists idx_work_shifts_company on work_shifts (company_id);
create index if not exists idx_work_shifts_worker on work_shifts (worker_id, started_at desc);

-- عامل واحد لا يملك أكثر من حصة مفتوحة واحدة في نفس اللحظة (تسجيل دخول واحد فعّال)
create unique index if not exists idx_work_shifts_one_open_per_worker
  on work_shifts (worker_id)
  where ended_at is null;

alter table work_shifts enable row level security;
create policy work_shifts_select on work_shifts for select using (company_id = get_my_company_id());
create policy work_shifts_insert on work_shifts for insert with check (company_id = get_my_company_id());
create policy work_shifts_update on work_shifts for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
-- لا سياسة حذف: الحصص لا تُحذف أبداً — سجل تاريخي دائم (متطلب الأرشيف/التدقيق)

-- ----------------------------------------------------------------------------
-- 2) ربط كل حدث (work_sessions) بالحصة التي وقع خلالها
-- ----------------------------------------------------------------------------
alter table work_sessions add column if not exists shift_id uuid references work_shifts(id) on delete set null;
create index if not exists idx_work_sessions_shift on work_sessions (shift_id);

-- ----------------------------------------------------------------------------
-- 3) حد 3 أحداث نشطة بالتوازي للعامل الواحد فقط (وليس حداً عاماً على النظام)
--    — يستبدل القيد القديم "جلسة واحدة مفتوحة فقط" الذي كان يخالف المتطلب
-- ----------------------------------------------------------------------------
drop index if exists idx_work_sessions_one_open_per_worker;

create or replace function enforce_max_active_sessions_per_worker()
returns trigger as $$
declare
  open_count integer;
begin
  if new.ended_at is null then
    select count(*) into open_count
    from work_sessions
    where worker_id = new.worker_id
      and ended_at is null
      and voided_at is null
      and id <> new.id;

    if open_count >= 3 then
      raise exception 'MAX_ACTIVE_EVENTS_REACHED: العامل لديه بالفعل 3 أحداث نشطة، يجب إيقاف واحد منها أولاً'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_work_sessions_max_active on work_sessions;
create trigger trg_work_sessions_max_active
before insert or update on work_sessions
for each row execute function enforce_max_active_sessions_per_worker();

-- ----------------------------------------------------------------------------
-- 4) سجل الأحداث والتصحيحات: لا حذف فعلي بعد الآن — voided_at + جدول تدقيق
-- ----------------------------------------------------------------------------
alter table work_sessions add column if not exists voided_at timestamptz;
alter table work_sessions add column if not exists voided_by_staff_id uuid references staff_users(id) on delete set null;
alter table work_sessions add column if not exists void_reason text;

-- منع الحذف الفعلي نهائياً على مستوى القاعدة (كان مسموحاً سابقاً في 0017)؛
-- أي "حذف" من الآن يجب أن يمر عبر voided_at للحفاظ على أثر تدقيقي دائم
drop policy if exists work_sessions_delete on work_sessions;

create table if not exists work_session_corrections (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  work_session_id     uuid not null references work_sessions(id) on delete cascade,

  action              text not null check (action in ('edit', 'void')),

  corrected_by_type   text not null check (corrected_by_type in ('staff', 'worker')),
  corrected_by_staff_id uuid references staff_users(id) on delete set null,
  corrected_by_worker_id uuid references workers(id) on delete set null,

  reason              text,

  old_started_at      timestamptz,
  old_ended_at        timestamptz,
  old_duration_seconds integer,

  new_started_at      timestamptz,
  new_ended_at        timestamptz,
  new_duration_seconds integer,

  created_at          timestamptz not null default now()
);

comment on table work_session_corrections is 'سجل تدقيق كامل لكل تصحيح أو إلغاء لحدث: من قام به، متى، القيمة القديمة والجديدة، والسبب — لا يُحذف أبداً';

create index if not exists idx_wsc_session on work_session_corrections (work_session_id, created_at desc);
create index if not exists idx_wsc_company on work_session_corrections (company_id, created_at desc);

alter table work_session_corrections enable row level security;
create policy work_session_corrections_select on work_session_corrections for select using (company_id = get_my_company_id());
create policy work_session_corrections_insert on work_session_corrections for insert with check (company_id = get_my_company_id());
-- لا سياسة تحديث ولا حذف: سجل التدقيق ثابت (append-only) بشكل مطلق

-- تحديث الـviews لاستبعاد الأحداث الملغاة (voided) من كل الحسابات النهائية
create or replace view v_project_actuals
with (security_invoker = true) as
select
  p.id                as project_id,
  p.company_id,
  p.name              as project_name,
  p.code              as project_code,
  p.status,
  p.estimated_hours,
  p.quoted_price,
  p.due_date,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'production'), 0) / 3600.0
    as actual_production_hours,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'downtime'), 0) / 3600.0
    as actual_downtime_hours,

  coalesce(sum(
    (ws.duration_seconds / 3600.0) * w.hourly_cost
  ) filter (where ws.session_type = 'production'), 0) as actual_labor_cost

from projects p
left join work_sessions ws on ws.project_id = p.id and ws.ended_at is not null and ws.voided_at is null
left join workers w on w.id = ws.worker_id
group by p.id, p.company_id, p.name, p.code, p.status, p.estimated_hours, p.quoted_price, p.due_date;

comment on view v_project_actuals is 'الوقت/التكلفة الفعليان الحقيقيان لكل مشروع، محسوبان من work_sessions المُغلقة وغير الملغاة';

create or replace view v_piece_task_actuals
with (security_invoker = true) as
select
  pt.id                 as piece_task_id,
  pt.company_id,
  pt.project_id,
  pt.manufacturing_order_id,
  pt.name                as piece_name,
  pt.phase,
  pt.status,
  pt.estimated_time_minutes,
  pt.sequence_order,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'production'), 0) / 60.0
    as actual_time_minutes,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'downtime'), 0) / 60.0
    as downtime_minutes,

  coalesce(sum(
    (ws.duration_seconds / 3600.0) * w.hourly_cost
  ) filter (where ws.session_type = 'production'), 0) as actual_cost,

  count(distinct ws.worker_id) filter (where ws.session_type = 'production') as workers_involved

from pieces_tasks pt
left join work_sessions ws on ws.piece_task_id = pt.id and ws.ended_at is not null and ws.voided_at is null
left join workers w on w.id = ws.worker_id
group by pt.id, pt.company_id, pt.project_id, pt.manufacturing_order_id, pt.name, pt.phase,
         pt.status, pt.estimated_time_minutes, pt.sequence_order;

comment on view v_piece_task_actuals is 'الوقت/التكلفة الفعليان لكل قطعة (تستبعد الأحداث الملغاة)؛ التقرير الموحد للقطعة';

create or replace view v_live_operations
with (security_invoker = true) as
select
  ws.id               as session_id,
  ws.company_id,
  ws.session_type,
  ws.started_at,
  extract(epoch from (now() - ws.started_at))::integer as elapsed_seconds,

  w.id                as worker_id,
  w.full_name         as worker_name,

  m.id                as machine_id,
  m.name              as machine_name,

  p.id                as project_id,
  p.name              as project_name,

  tt.name             as task_type_name,
  sr.name             as stop_reason_name

from work_sessions ws
join workers w on w.id = ws.worker_id
left join machines m on m.id = ws.machine_id
left join projects p on p.id = ws.project_id
left join task_types tt on tt.id = ws.task_type_id
left join stop_reasons sr on sr.id = ws.stop_reason_id
where ws.ended_at is null and ws.voided_at is null;

comment on view v_live_operations is 'كل الجلسات المفتوحة حالياً (غير ملغاة)؛ أساس المشاهدة الحية في لوحة المدير';

-- ----------------------------------------------------------------------------
-- 5) تقرير الحصة (Shift Report) — كان مفقوداً تماماً لغياب مفهوم الحصة أصلاً
-- ----------------------------------------------------------------------------
create or replace view v_shift_report
with (security_invoker = true) as
select
  sh.id                as shift_id,
  sh.company_id,
  sh.worker_id,
  w.full_name          as worker_name,
  sh.started_at,
  sh.ended_at,

  extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::integer
    as shift_duration_seconds,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'production'), 0)
    as production_seconds,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'downtime'), 0)
    as downtime_seconds,

  greatest(
    extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::integer
      - coalesce(sum(ws.duration_seconds), 0),
    0
  ) as uncovered_seconds,

  coalesce(sum(
    (ws.duration_seconds / 3600.0) * w.hourly_cost
  ) filter (where ws.session_type = 'production'), 0) as labor_cost,

  count(ws.id) filter (where ws.ended_at is not null and ws.voided_at is null) as events_count,

  (select count(*) from work_session_corrections wsc
    join work_sessions ws2 on ws2.id = wsc.work_session_id
    where ws2.shift_id = sh.id) as corrections_count,

  count(distinct ws.piece_task_id) filter (where ws.piece_task_id is not null) as pieces_worked

from work_shifts sh
join workers w on w.id = sh.worker_id
left join work_sessions ws on ws.shift_id = sh.id and ws.voided_at is null
group by sh.id, sh.company_id, sh.worker_id, w.full_name, w.hourly_cost, sh.started_at, sh.ended_at;

comment on view v_shift_report is 'تقرير الحصة: مدة الدوام، الوقت الإنتاجي/التوقف، الوقت غير المغطى، التكلفة، عدد الأحداث والتصحيحات';

-- ----------------------------------------------------------------------------
-- 6) Passation: ربط الرسالة بالمشروع والحصة صراحة (وليس فقط بالقطعة)
--    + حقل اختياري "العامل المستلم/التالي" المذكور صراحة في المتطلبات
-- ----------------------------------------------------------------------------
alter table piece_handoffs add column if not exists project_id uuid references projects(id) on delete cascade;
alter table piece_handoffs add column if not exists shift_id uuid references work_shifts(id) on delete set null;
alter table piece_handoffs add column if not exists to_worker_id uuid references workers(id) on delete set null;

-- تعبئة project_id للسجلات القديمة من القطعة المرتبطة
update piece_handoffs ph
set project_id = pt.project_id
from pieces_tasks pt
where ph.piece_task_id = pt.id and ph.project_id is null;

create index if not exists idx_piece_handoffs_project on piece_handoffs (project_id);

-- ----------------------------------------------------------------------------
-- 7) تفعيل Realtime على كل الجداول التشغيلية (كان مفعّلاً على activity_log
--    فقط) — ضروري لبند "التزامن اللحظي بين الإدارة والكشك"
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'task_types', 'stop_reasons', 'machines', 'projects', 'pieces_tasks',
      'planning', 'piece_handoffs', 'work_sessions', 'work_shifts',
      'manufacturing_orders', 'machine_tools'
    ]
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;
