-- ============================================================================
-- 0087_auto_primary_operation.sql
-- Remplit automatiquement pieces_tasks.primary_operation_type depuis
-- piece_costing_operations. Priorité : usinage_cnc (pivot), sinon la première.
-- ============================================================================

-- 1) Fonction de recalcul
create or replace function refresh_piece_primary_operation()
returns trigger
language plpgsql
as $$
declare
  v_piece_task_id uuid;
  v_primary text;
begin
  v_piece_task_id := coalesce(new.piece_task_id, old.piece_task_id);
  if v_piece_task_id is null then return coalesce(new, old); end if;

  -- Choisir : usinage_cnc prioritaire, sinon première opération par sequence_order
  select stage into v_primary
  from piece_costing_operations
  where piece_task_id = v_piece_task_id
  order by
    case when stage = 'usinage_cnc' then 0 else 1 end,
    sequence_order
  limit 1;

  if v_primary is not null then
    update pieces_tasks
    set primary_operation_type = v_primary
    where id = v_piece_task_id
      and (primary_operation_type is null or primary_operation_type <> v_primary);
  end if;

  return coalesce(new, old);
end;
$$;

-- 2) Trigger sur insert / update / delete
drop trigger if exists trg_refresh_piece_primary_op on piece_costing_operations;
create trigger trg_refresh_piece_primary_op
after insert or update or delete on piece_costing_operations
for each row execute function refresh_piece_primary_operation();

-- 3) Backfill : traiter toutes les pièces ayant des opérations
update pieces_tasks pt
set primary_operation_type = (
  select stage
  from piece_costing_operations o
  where o.piece_task_id = pt.id
  order by
    case when o.stage = 'usinage_cnc' then 0 else 1 end,
    o.sequence_order
  limit 1
)
where primary_operation_type is null
  and exists (select 1 from piece_costing_operations o where o.piece_task_id = pt.id);