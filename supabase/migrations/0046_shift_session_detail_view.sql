-- 0046_shift_session_detail_view.sql
-- ============================================================================
-- تقرير الحصة الكامل (worker report): يحتاج جدولاً تفصيلياً بأربعة أعمدة
-- (اسم الحدث، البداية، النهاية، المدة) لكل حدث وقع داخل حصة العامل، بالإضافة
-- إلى ملخص الوقت الإجمالي لكل نوع حدث — هذا الـview يوفر البيانات الخام لكليهما
-- (التجميع حسب نوع الحدث يُحسَب في الواجهة من نفس الصفوف، لا حاجة لview إضافي).
-- ============================================================================

create or replace view v_shift_session_detail
with (security_invoker = true) as
select
  ws.id                as session_id,
  ws.company_id,
  ws.shift_id,
  ws.session_type,
  ws.started_at,
  ws.ended_at,
  coalesce(
    ws.duration_seconds,
    extract(epoch from (now() - ws.started_at))::integer
  ) as duration_seconds,

  case
    when ws.session_type = 'production' then tt.name
    else sr.name
  end as event_name,

  m.name              as machine_name,
  p.name              as project_name,
  pt.name             as piece_name

from work_sessions ws
left join task_types tt on tt.id = ws.task_type_id
left join stop_reasons sr on sr.id = ws.stop_reason_id
left join machines m on m.id = ws.machine_id
left join projects p on p.id = ws.project_id
left join pieces_tasks pt on pt.id = ws.piece_task_id
where ws.shift_id is not null
  and ws.voided_at is null;

comment on view v_shift_session_detail is 'سجل تفصيلي بكل حدث داخل كل حصة (4 أعمدة: الحدث/البداية/النهاية/المدة) — أساس تقرير الحصة الكامل في قسم rapports';
