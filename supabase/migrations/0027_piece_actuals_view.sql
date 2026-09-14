-- ============================================================================
-- 0027_piece_actuals_view.sql
-- الوقت والتكلفة الفعليان لكل قطعة (وليس فقط لكل مشروع كاملاً كما في
-- v_project_actuals) — هذا ما يُمكِّن "التقرير الكامل لكل مشروع بجميع
-- مهامه (القطع)" الذي طُلب صراحة: سطر واحد تفصيلي لكل قطعة.
-- ============================================================================

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
left join work_sessions ws on ws.piece_task_id = pt.id and ws.ended_at is not null
left join workers w on w.id = ws.worker_id
group by pt.id, pt.company_id, pt.project_id, pt.manufacturing_order_id, pt.name, pt.phase,
         pt.status, pt.estimated_time_minutes, pt.sequence_order;

comment on view v_piece_task_actuals is 'الوقت/التكلفة الفعليان لكل قطعة على حدة؛ أساس التقرير التفصيلي الكامل لكل مشروع';
