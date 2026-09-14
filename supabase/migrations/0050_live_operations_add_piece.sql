-- ============================================================================
-- 0050_live_operations_add_piece.sql
-- "المشاهدة الحية" في Tableau de bord يجب أن تُظهر أيضاً القطعة التي يعمل
-- عليها العامل حالياً (وليس فقط العامل/الآلة/المشروع). work_sessions يملك
-- عمود piece_task_id مباشرة (0013)، لذا نضيف الربط مع pieces_tasks هنا.
--
-- ملاحظة مهمة: PostgreSQL يمنع CREATE OR REPLACE VIEW من تغيير اسم أو ترتيب
-- عمود موجود مسبقاً (SQLSTATE 42P16) — لذا الأعمدة الجديدة (piece_task_id،
-- piece_name) تُضاف حصراً في نهاية قائمة SELECT، بعد stop_reason_name التي
-- كانت آخر عمود في نسخة 0049، مع الحفاظ الحرفي على ترتيب كل الأعمدة السابقة.
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
  sr.name             as stop_reason_name,

  -- أعمدة جديدة (0050) — يجب أن تبقى دائماً في آخر القائمة
  pt.id               as piece_task_id,
  pt.name             as piece_name

from work_sessions ws
join workers w on w.id = ws.worker_id
left join machines m on m.id = ws.machine_id
left join projects p on p.id = ws.project_id
left join pieces_tasks pt on pt.id = ws.piece_task_id
left join task_types tt on tt.id = ws.task_type_id
left join stop_reasons sr on sr.id = ws.stop_reason_id
where ws.ended_at is null
  and ws.voided_at is null
  and ws.session_type = 'production';

comment on view v_live_operations is 'العمال الذين يقومون بنشاط إنتاجي فعلي الآن (جلسة production مفتوحة وغير ملغاة)، مع الآلة والمشروع والقطعة التي يعملون عليها — أساس المشاهدة الحية في لوحة المدير';
