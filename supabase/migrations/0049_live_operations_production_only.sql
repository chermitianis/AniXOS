-- ============================================================================
-- 0049_live_operations_production_only.sql
-- تصحيح: "المشاهدة الحية" في لوحة المدير (Tableau de bord) كانت تعرض كل
-- الجلسات المفتوحة (production + downtime)، أي أنها كانت تُظهر أيضاً العمال
-- في وضع توقف/استراحة كما لو كانوا يعملون فعلياً على آلاتهم. المتطلب: هذا
-- القسم يجب أن يعرض فقط العمال الذين لديهم جلسة مفتوحة *ويقومون بنشاط
-- إنتاجي حقيقي على آلة* في هذه اللحظة — لذا نقتصر على session_type = 'production'.
-- ============================================================================

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
where ws.ended_at is null
  and ws.voided_at is null
  and ws.session_type = 'production';

comment on view v_live_operations is 'العمال الذين يقومون بنشاط إنتاجي فعلي الآن (جلسة production مفتوحة وغير ملغاة)؛ أساس المشاهدة الحية في لوحة المدير — يستبعد عمداً جلسات التوقف/الاستراحة';
