-- ============================================================================
-- 0081_piece_costing_status.sql
-- Ajoute un statut de chiffrage par pièce (indépendant du statut projet).
-- La validation d'un projet devient automatique : dès que toutes ses pièces
-- sont validées, le projet passe en "approved".
-- ============================================================================

alter table pieces_tasks
  add column if not exists costing_status text not null default 'non_etudie'
  check (costing_status in ('non_etudie', 'brouillon', 'en_attente', 'valide'));

-- Backfill : les pièces qui ont déjà des opérations/matières → 'en_attente'
update pieces_tasks pt
set costing_status = 'en_attente'
where pt.costing_status = 'non_etudie'
  and exists (
    select 1 from piece_costing_operations o where o.piece_task_id = pt.id
    union all
    select 1 from piece_costing_materials m where m.piece_task_id = pt.id
  );

create index if not exists idx_pieces_tasks_costing_status
  on pieces_tasks (company_id, costing_status);

comment on column pieces_tasks.costing_status is
  'Statut de chiffrage par pièce. Indépendant de projects.status.';