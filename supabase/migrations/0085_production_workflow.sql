-- ============================================================================
-- 0085_production_workflow.sql
--
-- Unifie les statuts de production :
--   - pieces_tasks.production_status : 8 états cohérents avec le flux
--   - manufacturing_orders.status    : 6 états cohérents avec le flux
--   - colonnes de suivi d'avancement sur OF
--
-- Non destructif : les valeurs actuelles (not_sent / sent / draft / confirmed
-- / in_progress / done / cancelled) sont toutes acceptées par les nouvelles
-- contraintes — aucune migration de données n'est nécessaire.
-- ============================================================================

-- 1) Étendre pieces_tasks.production_status
alter table pieces_tasks drop constraint if exists pieces_tasks_production_status_check;

alter table pieces_tasks
  add constraint pieces_tasks_production_status_check
  check (production_status in (
    'not_sent',
    'sent',
    'in_preparation',
    'ready_to_start',
    'scheduled',
    'in_progress',
    'completed',
    'on_hold'
  ));

-- 2) Étendre manufacturing_orders.status
alter table manufacturing_orders drop constraint if exists manufacturing_orders_status_check;

alter table manufacturing_orders
  add constraint manufacturing_orders_status_check
  check (status in (
    'draft',
    'prepared',
    'scheduled',
    'in_progress',
    'completed',
    'cancelled',
    -- compat avec les états existants déjà utilisés
    'confirmed',
    'done'
  ));

-- 3) Colonnes de suivi d'avancement sur OF
alter table manufacturing_orders
  add column if not exists prepared_at timestamptz,
  add column if not exists scheduled_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

comment on column manufacturing_orders.prepared_at is
  'Date à laquelle le dossier a été préparé (draft → prepared).';
comment on column manufacturing_orders.scheduled_at is
  'Date à laquelle la première pièce a été planifiée (prepared → scheduled).';
comment on column manufacturing_orders.started_at is
  'Date de démarrage réel de la première pièce (Kiosk).';
comment on column manufacturing_orders.completed_at is
  'Date d''achèvement de la dernière pièce.';

-- 4) Index utiles pour les dashboards
create index if not exists idx_pieces_tasks_production_status
  on pieces_tasks (company_id, production_status);

create index if not exists idx_manufacturing_orders_status
  on manufacturing_orders (company_id, status);