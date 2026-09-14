-- ============================================================================
-- 0026_completion_triggers.sql
-- الحلقة الأهم في الربط الكامل: عندما يُنهي العامل قطعة في الكشك (تُحدَّث
-- pieces_tasks.status)، يُعاد حساب حالة أمر التصنيع والمشروع تلقائياً —
-- بلا أي تدخل يدوي من الإدارة. هذا ما يجعل "تسجيل إنجاز المشروع على واجهة
-- العامل" ينعكس فورياً على كل الأقسام الأخرى.
-- ============================================================================

create or replace function recalc_completion_after_piece_update()
returns trigger as $$
declare
  v_mo_id uuid := coalesce(new.manufacturing_order_id, old.manufacturing_order_id);
  v_project_id uuid := coalesce(new.project_id, old.project_id);
  v_total int;
  v_completed int;
  v_has_in_progress boolean;
begin
  -- ------------------------------------------------------------------
  -- إعادة حساب حالة أمر التصنيع المرتبط (إن وُجد)
  -- ------------------------------------------------------------------
  if v_mo_id is not null then
    select
      count(*) filter (where status <> 'cancelled'),
      count(*) filter (where status = 'completed'),
      bool_or(status = 'in_progress')
    into v_total, v_completed, v_has_in_progress
    from pieces_tasks
    where manufacturing_order_id = v_mo_id;

    if v_total > 0 and v_total = v_completed then
      update manufacturing_orders set status = 'done'
      where id = v_mo_id and status not in ('done', 'cancelled');
    elsif v_completed > 0 or v_has_in_progress then
      update manufacturing_orders set status = 'in_progress'
      where id = v_mo_id and status = 'confirmed';
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- إعادة حساب حالة المشروع نفسه (كل قطعه بلا استثناء، عبر كل أوامر
  -- التصنيع التابعة له بالإضافة لأي قطع مباشرة بلا أمر تصنيع)
  -- ------------------------------------------------------------------
  if v_project_id is not null then
    select
      count(*) filter (where status <> 'cancelled'),
      count(*) filter (where status = 'completed')
    into v_total, v_completed
    from pieces_tasks
    where project_id = v_project_id;

    if v_total > 0 and v_total = v_completed then
      update projects set status = 'completed', completed_at = now()
      where id = v_project_id and status not in ('completed', 'cancelled');
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

comment on function recalc_completion_after_piece_update() is
  'يُعيد حساب حالة أمر التصنيع والمشروع تلقائياً كلما تغيّرت حالة قطعة (pieces_tasks)؛ الحلقة المركزية للربط بين الكشك وبقية الأقسام';

create trigger trg_recalc_completion
after insert or update of status on pieces_tasks
for each row execute function recalc_completion_after_piece_update();
