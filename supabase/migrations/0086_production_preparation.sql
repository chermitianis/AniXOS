-- ============================================================================
-- 0086_production_preparation.sql
--
-- Prépare le workflow "1 pièce = 1 OF" avec :
--   - lien direct manufacturing_orders.piece_task_id
--   - type d'opération principale sur la pièce (détermine l'interface)
--   - type d'interface sur le worker (cnc / manual / both)
--
-- Non destructif.
-- ============================================================================

-- 1) Lien direct OF ↔ pièce (1:1)
alter table manufacturing_orders
  add column if not exists piece_task_id uuid references pieces_tasks(id) on delete cascade;

create unique index if not exists idx_manufacturing_orders_piece_unique
  on manufacturing_orders (piece_task_id)
  where piece_task_id is not null;

-- 2) Type d'opération principale sur la pièce (pour l'aiguillage d'interface)
alter table pieces_tasks
  add column if not exists primary_operation_type text;

comment on column pieces_tasks.primary_operation_type is
  'Type de la première opération (usinage_cnc, tournage_classique, ...). Détermine l''interface Kiosk (CNC vs Manual). Rempli automatiquement depuis le chiffrage, modifiable manuellement.';

create index if not exists idx_pieces_tasks_primary_op
  on pieces_tasks (company_id, primary_operation_type);

-- 3) Interface du worker (cnc / manual / both)
alter table workers
  add column if not exists interface_type text not null default 'both'
  check (interface_type in ('cnc', 'manual', 'both'));

comment on column workers.interface_type is
  'Interface Kiosk autorisée pour ce worker : cnc (machines à commande numérique), manual (postes manuels), both (les deux).';

-- 4) Index pour la préparation
create index if not exists idx_manufacturing_orders_prepared
  on manufacturing_orders (company_id, prepared_at)
  where prepared_at is not null;