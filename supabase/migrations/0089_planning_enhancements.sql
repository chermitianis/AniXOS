-- ============================================================================
-- 0089_planning_enhancements.sql
--
-- Améliore le workflow de planification :
--   - Lien unique 1:1 entre planning et manufacturing_orders
--   - Index pour requêtes par date/shift
--   - Colonnes de suivi de démarrage/fin réelle
-- ============================================================================

-- 1) Suivi temporel sur planning
alter table planning
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

comment on column planning.started_at is
  'Date de démarrage réel (Kiosk).';
comment on column planning.completed_at is
  'Date de fin réelle.';

-- 2) Index pour Kiosk : trouver les affectations du jour par worker
create index if not exists idx_planning_worker_date
  on planning (company_id, worker_id, planned_date)
  where status != 'cancelled';

create index if not exists idx_planning_machine_date
  on planning (company_id, machine_id, planned_date)
  where status != 'cancelled';

-- 3) Suivi sur piece_tasks : pointage scheduled
alter table pieces_tasks
  add column if not exists scheduled_at timestamptz;

comment on column pieces_tasks.scheduled_at is
  'Date à laquelle la pièce a été affectée à une machine/opérateur (planning).';