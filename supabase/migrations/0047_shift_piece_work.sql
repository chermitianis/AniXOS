-- 0047_shift_piece_work.sql
-- ============================================================================
-- تتبّع القطع/المشاريع التي اشتغل عليها العامل خلال حصة معيّنة (جدول ثانٍ في
-- تقرير الحصة، بند طلبه المستخدم صراحة). البداية = لحظة اختيار العامل للقطعة
-- من قائمة المخطط، والنهاية = لحظة الضغط على Terminer، أو لحظة تبديل القطعة
-- (اختيار قطعة أخرى دون الضغط على Terminer)، أو لحظة نهاية الحصة (تسجيل
-- الخروج دون الضغط على Terminer) — أياً وقع أولاً.
-- ============================================================================

create table if not exists shift_piece_work (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  shift_id       uuid not null references work_shifts(id) on delete cascade,
  worker_id      uuid not null references workers(id) on delete cascade,
  piece_task_id  uuid not null references pieces_tasks(id) on delete cascade,
  project_id     uuid references projects(id) on delete set null,

  started_at     timestamptz not null default now(),
  ended_at       timestamptz,

  created_at     timestamptz not null default now()
);

comment on table shift_piece_work is 'فترة اشتغال فعلية لعامل على قطعة معيّنة ضمن حصة واحدة — أساس الجدول الثاني في تقرير الحصة (القطعة/المشروع/البداية/النهاية/الوقت الجملي)';

create index if not exists idx_shift_piece_work_shift on shift_piece_work (shift_id);
create index if not exists idx_shift_piece_work_piece on shift_piece_work (piece_task_id);

-- لا يمكن أن يكون للعامل أكثر من فترة مفتوحة واحدة على نفس القطعة ضمن نفس
-- الحصة (حماية إضافية على مستوى القاعدة ضد التكرار عند إعادة المزامنة)
create unique index if not exists idx_shift_piece_work_one_open
  on shift_piece_work (shift_id, piece_task_id)
  where ended_at is null;

alter table shift_piece_work enable row level security;
create policy shift_piece_work_select on shift_piece_work for select using (company_id = get_my_company_id());
create policy shift_piece_work_insert on shift_piece_work for insert with check (company_id = get_my_company_id());
create policy shift_piece_work_update on shift_piece_work for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
-- لا سياسة حذف: سجل تاريخي دائم ضمن تقرير الحصة

-- إضافة الجدول لبث Realtime (اتساقاً مع بقية الجداول التشغيلية)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shift_piece_work'
     )
  then
    execute 'alter publication supabase_realtime add table shift_piece_work';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- الجدول الثاني في تقرير الحصة: القطعة / المشروع / البداية / النهاية / الوقت الجملي
-- ----------------------------------------------------------------------------
create or replace view v_shift_piece_summary
with (security_invoker = true) as
select
  spw.id,
  spw.company_id,
  spw.shift_id,
  spw.piece_task_id,
  pt.name              as piece_name,
  spw.project_id,
  pr.name              as project_name,
  spw.started_at,
  coalesce(spw.ended_at, sh.ended_at)   as ended_at,
  extract(epoch from (coalesce(spw.ended_at, sh.ended_at, now()) - spw.started_at))::integer
    as total_seconds

from shift_piece_work spw
join pieces_tasks pt on pt.id = spw.piece_task_id
left join projects pr on pr.id = spw.project_id
join work_shifts sh on sh.id = spw.shift_id;

comment on view v_shift_piece_summary is 'القطع/المشاريع التي اشتغل عليها العامل خلال حصة معيّنة، بعدد أسطر يساوي عدد القطع — الجدول الثاني في تقرير الحصة';
