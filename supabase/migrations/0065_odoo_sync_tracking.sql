-- ============================================================================
-- 0065_odoo_sync_tracking.sql
-- Ajoute :
--   - Colonnes de tracking sur clients, projects, invoices (odoo_id)
--   - Table odoo_sync_log (historique complet des synchronisations)
--   - Index pour requêtes efficaces
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Colonne odoo_id sur les tables à synchroniser
-- ----------------------------------------------------------------------------

alter table clients
  add column if not exists odoo_id integer;

create unique index if not exists uq_clients_company_odoo
  on clients (company_id, odoo_id)
  where odoo_id is not null;

alter table projects
  add column if not exists odoo_id integer;

create unique index if not exists uq_projects_company_odoo
  on projects (company_id, odoo_id)
  where odoo_id is not null;

alter table invoices
  add column if not exists odoo_id integer;

create unique index if not exists uq_invoices_company_odoo
  on invoices (company_id, odoo_id)
  where odoo_id is not null;

-- ----------------------------------------------------------------------------
-- 2) Table odoo_sync_log (historique)
-- ----------------------------------------------------------------------------

create table if not exists odoo_sync_log (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  direction       text not null check (direction in ('pull', 'push')),
  status          text not null check (status in ('in_progress', 'success', 'failed', 'partial')),
  records_synced  integer not null default 0,
  details         jsonb,
  error_message   text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

comment on table odoo_sync_log is
  'Historique des synchronisations Odoo ↔ AniXOS (pull et push)';

create index if not exists idx_odoo_sync_log_company
  on odoo_sync_log (company_id, started_at desc);

create index if not exists idx_odoo_sync_log_status
  on odoo_sync_log (status)
  where status in ('failed', 'partial');

-- ----------------------------------------------------------------------------
-- 3) RLS sur odoo_sync_log
-- ----------------------------------------------------------------------------

alter table odoo_sync_log enable row level security;

drop policy if exists odoo_sync_log_select on odoo_sync_log;
create policy odoo_sync_log_select on odoo_sync_log
  for select
  using (company_id = get_my_company_id() AND is_my_company_owner(company_id));

drop policy if exists odoo_sync_log_insert on odoo_sync_log;
create policy odoo_sync_log_insert on odoo_sync_log
  for insert
  with check (company_id = get_my_company_id());