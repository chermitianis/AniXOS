-- ============================================================================
-- 0071_production_planning_execution_context.sql
-- توسيع مخطط الورشة دون تغيير ترتيب الأعمدة السابقة حتى تبقى النسخ القديمة متوافقة.
-- ============================================================================

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
  pl.status,

  w.id                as worker_id,
  w.full_name         as worker_name,
  pl.shift_number,

  -- أعمدة جديدة في النهاية فقط: لا نكسر المستهلكين الحاليين للـView.
  pl.manufacturing_order_id,
  mo.order_number,
  mo.product_name,
  pt.estimated_time_minutes,
  pt.drawing_url,
  pl.notes

from planning pl
join machines m on m.id = pl.machine_id
join workers w on w.id = pl.worker_id
left join projects p on p.id = pl.project_id
left join pieces_tasks pt on pt.id = pl.piece_task_id
left join manufacturing_orders mo on mo.id = pl.manufacturing_order_id
left join clients c on c.id = p.client_id
where pl.status <> 'cancelled';

comment on view v_machine_planning_overview is
  'مخطط الورشة مع العميل والمشروع والقطعة والـOF والزمن التقديري والرسم والملاحظات؛ للمدير والكشك وPWA العامل.';
