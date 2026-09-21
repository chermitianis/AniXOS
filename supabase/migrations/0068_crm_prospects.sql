-- ============================================================================
-- 0068_crm_prospects.sql
-- Module CRM : gestion des prospects, pipeline commercial, et historique
-- des interactions (appels, emails, RDV, notes).
--
-- Tables :
--   - crm_prospects     : prospects & opportunités commerciales
--   - crm_interactions  : historique des interactions par prospect
--
-- RLS : isolation par company_id + owner-only pour les champs sensibles
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Table crm_prospects
-- ----------------------------------------------------------------------------
create table if not exists crm_prospects (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,

  -- Informations de base
  full_name         text not null,
  company_name      text,
  email             text,
  phone             text,
  source            text,                          -- ex: "Site web", "Salon", "Recommandation"
  notes             text,

  -- Pipeline
  stage             text not null default 'nouveau'
                    check (stage in ('nouveau', 'contacte', 'negociation', 'gagne', 'perdu')),
  estimated_value   numeric(14, 2),                -- valeur estimée en TND
  probability       integer check (probability >= 0 and probability <= 100),
  expected_close_at date,                          -- date de clôture prévue

  -- Attribution
  owner_staff_id    uuid references staff_users(id) on delete set null,

  -- Conversion en client
  converted_at      timestamptz,
  converted_client_id uuid references clients(id) on delete set null,

  -- Timestamps
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table crm_prospects is
  'Prospects et opportunités commerciales — alimente le pipeline CRM';

create index if not exists idx_crm_prospects_company
  on crm_prospects (company_id, stage, created_at desc);

create index if not exists idx_crm_prospects_owner
  on crm_prospects (owner_staff_id)
  where owner_staff_id is not null;

-- Trigger updated_at
create trigger trg_crm_prospects_updated_at
before update on crm_prospects
for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Table crm_interactions
-- ----------------------------------------------------------------------------
create table if not exists crm_interactions (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  prospect_id       uuid not null references crm_prospects(id) on delete cascade,

  type              text not null check (type in ('appel', 'email', 'rdv', 'note')),
  summary           text not null,
  happened_at       timestamptz not null default now(),

  author_staff_id   uuid references staff_users(id) on delete set null,
  created_at        timestamptz not null default now()
);

comment on table crm_interactions is
  'Historique des interactions (appels, emails, RDV, notes) pour chaque prospect';

create index if not exists idx_crm_interactions_prospect
  on crm_interactions (prospect_id, happened_at desc);

create index if not exists idx_crm_interactions_company
  on crm_interactions (company_id, happened_at desc);

-- ----------------------------------------------------------------------------
-- 3) RLS sur crm_prospects
-- ----------------------------------------------------------------------------
alter table crm_prospects enable row level security;

drop policy if exists crm_prospects_select on crm_prospects;
create policy crm_prospects_select on crm_prospects
  for select using (company_id = get_my_company_id());

drop policy if exists crm_prospects_insert on crm_prospects;
create policy crm_prospects_insert on crm_prospects
  for insert with check (company_id = get_my_company_id());

drop policy if exists crm_prospects_update on crm_prospects;
create policy crm_prospects_update on crm_prospects
  for update using (company_id = get_my_company_id());

drop policy if exists crm_prospects_delete on crm_prospects;
create policy crm_prospects_delete on crm_prospects
  for delete using (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 4) RLS sur crm_interactions
-- ----------------------------------------------------------------------------
alter table crm_interactions enable row level security;

drop policy if exists crm_interactions_select on crm_interactions;
create policy crm_interactions_select on crm_interactions
  for select using (company_id = get_my_company_id());

drop policy if exists crm_interactions_insert on crm_interactions;
create policy crm_interactions_insert on crm_interactions
  for insert with check (company_id = get_my_company_id());

drop policy if exists crm_interactions_update on crm_interactions;
create policy crm_interactions_update on crm_interactions
  for update using (company_id = get_my_company_id());

drop policy if exists crm_interactions_delete on crm_interactions;
create policy crm_interactions_delete on crm_interactions
  for delete using (company_id = get_my_company_id());