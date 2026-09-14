-- 0048_tool_length_material_reclamations_maintenance.sql
-- ============================================================================
-- دفعة إضافات مترابطة:
--  1) machine_tools.tool_length (longueur fonctionnelle) بعد قطر الأداة
--  2) pieces_tasks.material + pieces_tasks.quantity (مطلوبان لواجهة الكشك
--     الجديدة "Planning" ولإدارة القطع)
--  3) workshop_reclamations: رسائل réclamation من العمال إلى الإدارة
--  4) machine_maintenance_log: توثيق تواريخ صيانة الآلات
--  5) v_machine_planning_overview: المخطط الكامل لكل آلة (5 أعمدة)
-- ============================================================================

-- 1) طول الأداة الوظيفي — يُعرَض بعد عمود القطر في واجهة الكشك
alter table machine_tools add column if not exists tool_length numeric(10,2) default 0.00;
comment on column machine_tools.tool_length is 'longueur fonctionnelle: طول الأداة الوظيفي، يُستخدَم لتسهيل اختيار الأداة أثناء البرمجة';

-- 2) مادة القطعة وكميتها
alter table pieces_tasks add column if not exists material text;
alter table pieces_tasks add column if not exists quantity integer not null default 1 check (quantity > 0);
comment on column pieces_tasks.material is 'نوع المادة المخصصة للقطعة (Aluminium, Acier XC48, Laiton, POM, PVC...)';

-- ----------------------------------------------------------------------------
-- 3) Réclamations: رسائل العامل إلى الإدارة (مشكلة/طلب)، مرتبطة اختيارياً بآلة
-- ----------------------------------------------------------------------------
create table if not exists workshop_reclamations (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  worker_id       uuid not null references workers(id) on delete cascade,
  machine_id      uuid references machines(id) on delete set null,

  message         text not null,
  status          text not null default 'nouveau'
                  check (status in ('nouveau', 'en_cours', 'resolu')),

  resolved_by_staff_id uuid references staff_users(id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,

  created_at      timestamptz not null default now()
);

comment on table workshop_reclamations is 'رسائل الإبلاغ عن مشكلة أو طلب من العامل إلى الإدارة، تظهر في قسم Maintenance et Besoins';

create index if not exists idx_workshop_reclamations_company on workshop_reclamations (company_id, status, created_at desc);

alter table workshop_reclamations enable row level security;
create policy workshop_reclamations_select on workshop_reclamations for select using (company_id = get_my_company_id());
create policy workshop_reclamations_insert on workshop_reclamations for insert with check (company_id = get_my_company_id());
create policy workshop_reclamations_update on workshop_reclamations for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 4) سجل صيانة الآلات: يوثّق تواريخ الصيانة الفعلية والمقبلة لكل آلة
-- ----------------------------------------------------------------------------
create table if not exists machine_maintenance_log (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  machine_id          uuid not null references machines(id) on delete cascade,

  maintenance_date    date not null,
  description         text not null,
  performed_by        text,
  next_due_date       date,

  created_by_staff_id uuid references staff_users(id) on delete set null,
  created_at          timestamptz not null default now()
);

comment on table machine_maintenance_log is 'توثيق تواريخ صيانة الآلات (المنجَزة والمقبلة) — قسم Maintenance et Besoins';

create index if not exists idx_machine_maintenance_log_machine on machine_maintenance_log (machine_id, maintenance_date desc);

alter table machine_maintenance_log enable row level security;
create policy machine_maintenance_log_select on machine_maintenance_log for select using (company_id = get_my_company_id());
create policy machine_maintenance_log_insert on machine_maintenance_log for insert with check (company_id = get_my_company_id());
create policy machine_maintenance_log_update on machine_maintenance_log for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy machine_maintenance_log_delete on machine_maintenance_log for delete using (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 5) المخطط الكامل لكل آلة — زر "Planning" في واجهة الكشك
--    5 أعمدة: Projet / Réf. pièce / Quantité / Client / Matière
-- ----------------------------------------------------------------------------
create or replace view v_machine_planning_overview
with (security_invoker = true) as
select
  pl.id               as planning_id,
  pl.company_id,
  pl.machine_id,
  m.name              as machine_name,

  p.id                as project_id,
  p.name              as project_name,

  pt.id               as piece_task_id,
  coalesce(pt.code, pt.name) as piece_ref,
  pt.quantity,
  pt.material,

  c.name              as client_name,

  pl.planned_date,
  pl.status

from planning pl
join machines m on m.id = pl.machine_id
left join projects p on p.id = pl.project_id
left join pieces_tasks pt on pt.id = pl.piece_task_id
left join clients c on c.id = p.client_id
where pl.status <> 'cancelled';

comment on view v_machine_planning_overview is 'المخطط الكامل لكل آلة (Projet/Réf. pièce/Quantité/Client/Matière) — لواجهة الكشك';

-- ----------------------------------------------------------------------------
-- 6) Realtime: إضافة الجداول الجديدة لبث التحديثات الحية
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['workshop_reclamations', 'machine_maintenance_log']
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
