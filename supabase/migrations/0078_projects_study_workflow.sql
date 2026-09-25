-- ============================================================================
-- 0078_projects_study_workflow.sql
--
-- Cycle de vie complet du projet : draft → studying → studied → approved
-- → in_production → completed (+ on_hold, cancelled)
--
-- Ordre correct : remapper les données AVANT de poser la nouvelle contrainte.
-- ============================================================================

-- 1) D'abord : retirer l'ancienne contrainte (sinon impossible de remapper)
alter table projects drop constraint if exists projects_status_check;

-- 2) Ensuite : remapper les anciennes valeurs (draft et in_production)
update projects set status = 'draft'         where status = 'planned';
update projects set status = 'in_production' where status = 'in_progress';

-- 3) Puis : poser la nouvelle contrainte sur des données déjà conformes
alter table projects
  add constraint projects_status_check
  check (status in (
    'draft',
    'studying',
    'studied',
    'approved',
    'in_production',
    'on_hold',
    'completed',
    'cancelled'
  ));

-- 4) Nouvelle valeur par défaut
alter table projects alter column status set default 'draft';

-- 5) Colonnes de suivi de l'étude technique
alter table projects
  add column if not exists study_started_at   timestamptz,
  add column if not exists study_completed_at timestamptz,
  add column if not exists study_notes        text;

comment on column projects.study_started_at is
  'Date de prise en charge par l''ingénierie (passage à studying).';
comment on column projects.study_completed_at is
  'Date de fin d''étude (passage à studied ou approved).';

-- 6) Index pour filtrage par statut
create index if not exists idx_projects_company_status
  on projects (company_id, status);