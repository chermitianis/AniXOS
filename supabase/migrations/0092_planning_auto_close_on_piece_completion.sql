-- ============================================================================
-- Migration 0092: Auto-close planning entries when a piece is completed
-- ============================================================================
-- الهدف: عند اكتمال قطعة (status = 'completed') من Kiosk عبر Terminer،
--        تُعلَّم كل أسطر planning المرتبطة بها تلقائياً كـ'done' مع تسجيل
--        completed_at. هذا:
--          1) يُخفي القطعة من PlanningAdminPage (فلترة الحالة النشطة).
--          2) يحفظ تاريخ الإنجاز في السجل (للأرشيف والتقارير).
--
-- ملاحظات مهمة:
--   - القيمة المستخدمة هي 'done' (وليس 'completed') لأن CHECK constraint
--     الحالي على planning.status يفرض: 'scheduled' | 'in_progress' | 'done' | 'cancelled'.
--   - لن نلمس recalc_completion_after_piece_update() الموجودة — سنضيف
--     trigger جديد باسم مختلف لا يتعارض معها.
-- ============================================================================

-- 1. دالة المزامنة
CREATE OR REPLACE FUNCTION sync_planning_on_piece_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  -- فقط عندما تُعلَّم القطعة 'completed' (وليس عند أي تعديل آخر).
  -- شرط `old.status <> 'completed'` يمنع التحديث المتكرر عند أي تعديل لاحق
  -- على القطعة بعد اكتمالها.
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
    update planning
    set status = 'done',
        completed_at = now(),
        updated_at = now()
    where piece_task_id = new.id
      and status <> 'done';  -- لا تُكرِّر التحديث لأسطر مكتملة أصلاً
  end if;
  return new;
end;
$$;

-- 2. الـTrigger (AFTER UPDATE فقط — الحالة تتغير من pending/in_progress إلى completed)
DROP TRIGGER IF EXISTS trg_sync_planning_on_piece_completion ON pieces_tasks;
CREATE TRIGGER trg_sync_planning_on_piece_completion
  AFTER UPDATE ON pieces_tasks
  FOR EACH ROW
  EXECUTE FUNCTION sync_planning_on_piece_completion();