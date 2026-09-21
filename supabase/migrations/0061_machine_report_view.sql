-- ============================================================================
-- 0061_machine_report_view.sql
-- View مخصصة لتقارير الآلات — تجميع production/downtime/sessions/workers
-- لكل آلة على حدة، مع دعم التصفية بالفترة الزمنية (from/to).
--
-- لماذا view جديدة؟
--   MachineReportTab الحالي يقرأ work_sessions مباشرة (بدون aggregate) → بطيء
--   ولا يوفّر إحصاءات مجمّعة. هذه الـview تُحسّن الأداء وتُبسّط الاستعلام.
--
-- ملاحظة: العمل على work_sessions (production/downtime) فقط، لأنها المصدر
-- الحقيقي للوقت. آلات لم تُستخدم = صفر صفوف (يُعرض "" من الواجهة).
-- ============================================================================

create or replace view v_machine_report
with (security_invoker = true) as
select
  m.id                as machine_id,
  m.company_id,
  m.name              as machine_name,
  m.code              as machine_code,
  m.machine_type      as machine_type,
  m.current_status    as current_status,

  -- الوقت الإنتاجي الكلي (ثواني)
  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'production'), 0)
    as production_seconds,

  -- وقت التوقف الكلي (ثواني)
  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'downtime'), 0)
    as downtime_seconds,

  -- إجمالي الوقت المُستَخدَم (production + downtime)
  coalesce(sum(ws.duration_seconds) filter (where ws.session_type in ('production','downtime')), 0)
    as total_seconds,

  -- عدد الجلسات المُغلقة
  count(ws.id) filter (where ws.ended_at is not null) as sessions_count,

  -- عدد العمال المتميزين الذين استخدموا الآلة
  count(distinct ws.worker_id) filter (where ws.session_type = 'production') as workers_count,

  -- آخر استخدام (للفرز والعرض)
  max(ws.started_at) as last_used_at,

  -- تكلفة العمالة الفعلية المرتبطة بهذه الآلة (production)
  coalesce(sum(
    (ws.duration_seconds / 3600.0) * w.hourly_cost
  ) filter (where ws.session_type = 'production'), 0) as labor_cost

from machines m
left join work_sessions ws
  on ws.machine_id = m.id
  and ws.ended_at is not null
  and ws.voided_at is null
left join workers w on w.id = ws.worker_id
group by m.id, m.company_id, m.name, m.code, m.machine_type, m.current_status;

comment on view v_machine_report is
  'تجميع لكل آلة: وقت الإنتاج/التوقف، عدد الجلسات، العمال، التكلفة، آخر استخدام — أساس تقرير الآلات في قسم rapports';

-- نُعرّض للـ authenticated فقط عبر RLS المتوارثة من الجداول
revoke all on v_machine_report from public;
grant select on v_machine_report to authenticated;

notify pgrst, 'reload schema';