-- ============================================================================
-- 0070_costing_redesign.sql
-- Refonte complète du module de chiffrage des pièces.
--
-- Remplace le modèle "tableur" (nomenclature_columns/rows/cells) par un
-- modèle métier en 2 tables :
--   - piece_costing_operations : une ligne par étape de production
--   - piece_costing_materials  : une ligne par matière utilisée
--
-- Conservation des anciennes tables pour compatibilité (archives).
-- nomenclature.total_estimated_cost est désormais mis à jour comme :
--   Σ(subtotals opérations) + Σ(subtotals matières)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Table piece_costing_operations
-- ----------------------------------------------------------------------------
create table if not exists piece_costing_operations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  nomenclature_id   uuid not null references nomenclatures(id) on delete cascade,
  piece_task_id     uuid references pieces_tasks(id) on delete cascade,

  stage             text not null check (stage in (
                      'usinage_cnc', 'tournage_classique', 'usinage_classique',
                      'rectification', 'ajustage', 'stt', 'anodisation',
                      'controle_qualite', 'autre'
                    )),
  label             text,                                   -- utilisé uniquement si stage='autre'
  estimated_hours   numeric(10, 2) not null default 0,
  hourly_rate       numeric(10, 2) not null default 0,
  subtotal          numeric(14, 2) generated always as (estimated_hours * hourly_rate) stored,
  notes             text,

  sequence_order    integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table piece_costing_operations is
  'Chiffrage — une ligne par étape de production (usinage CNC, STT, anodisation, ...)';

create index if not exists idx_costing_ops_company
  on piece_costing_operations (company_id, nomenclature_id, sequence_order);

create index if not exists idx_costing_ops_piece
  on piece_costing_operations (piece_task_id)
  where piece_task_id is not null;

create trigger trg_costing_ops_updated_at
before update on piece_costing_operations
for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Table piece_costing_materials
-- ----------------------------------------------------------------------------
create table if not exists piece_costing_materials (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  nomenclature_id   uuid not null references nomenclatures(id) on delete cascade,
  piece_task_id     uuid references pieces_tasks(id) on delete cascade,

  material_name     text not null,
  material_code     text,

  quantity          numeric(12, 3) not null default 0,
  unit              text not null default 'kg' check (unit in ('kg', 'g', 'm', 'cm', 'mm', 'm2', 'm3', 'L', 'ml', 'pièce')),
  unit_price        numeric(12, 3) not null default 0,
  subtotal          numeric(14, 2) generated always as (quantity * unit_price) stored,

  notes             text,
  sequence_order    integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table piece_costing_materials is
  'Chiffrage — une ligne par matière utilisée (acier, alu, huile, peinture, ...)';

create index if not exists idx_costing_mats_company
  on piece_costing_materials (company_id, nomenclature_id, sequence_order);

create index if not exists idx_costing_mats_piece
  on piece_costing_materials (piece_task_id)
  where piece_task_id is not null;

create trigger trg_costing_mats_updated_at
before update on piece_costing_materials
for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) RLS — isolation stricte par company_id
-- ----------------------------------------------------------------------------
alter table piece_costing_operations enable row level security;
alter table piece_costing_materials enable row level security;

-- operations
drop policy if exists costing_ops_select on piece_costing_operations;
create policy costing_ops_select on piece_costing_operations
  for select using (company_id = get_my_company_id());

drop policy if exists costing_ops_insert on piece_costing_operations;
create policy costing_ops_insert on piece_costing_operations
  for insert with check (company_id = get_my_company_id());

drop policy if exists costing_ops_update on piece_costing_operations;
create policy costing_ops_update on piece_costing_operations
  for update using (company_id = get_my_company_id());

drop policy if exists costing_ops_delete on piece_costing_operations;
create policy costing_ops_delete on piece_costing_operations
  for delete using (company_id = get_my_company_id());

-- materials
drop policy if exists costing_mats_select on piece_costing_materials;
create policy costing_mats_select on piece_costing_materials
  for select using (company_id = get_my_company_id());

drop policy if exists costing_mats_insert on piece_costing_materials;
create policy costing_mats_insert on piece_costing_materials
  for insert with check (company_id = get_my_company_id());

drop policy if exists costing_mats_update on piece_costing_materials;
create policy costing_mats_update on piece_costing_materials
  for update using (company_id = get_my_company_id());

drop policy if exists costing_mats_delete on piece_costing_materials;
create policy costing_mats_delete on piece_costing_materials
  for delete using (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 4) Vue agrégée : total par pièce (operations + materials)
-- ----------------------------------------------------------------------------
create or replace view v_piece_costing_summary
with (security_invoker = true)
as
select
  n.company_id,
  n.id                              as nomenclature_id,
  n.project_id,
  n.status,
  n.total_estimated_cost            as saved_total,

  coalesce((
    select sum(o.subtotal)
    from piece_costing_operations o
    where o.nomenclature_id = n.id
  ), 0)                             as total_operations,

  coalesce((
    select sum(m.subtotal)
    from piece_costing_materials m
    where m.nomenclature_id = n.id
  ), 0)                             as total_materials,

  coalesce((
    select sum(o.subtotal)
    from piece_costing_operations o
    where o.nomenclature_id = n.id
  ), 0) + coalesce((
    select sum(m.subtotal)
    from piece_costing_materials m
    where m.nomenclature_id = n.id
  ), 0)                             as live_total,

  coalesce((
    select sum(o.estimated_hours)
    from piece_costing_operations o
    where o.nomenclature_id = n.id and o.stage = 'usinage_cnc'
  ), 0)                             as cnc_hours,

  coalesce((
    select sum(o.subtotal)
    from piece_costing_operations o
    where o.nomenclature_id = n.id and o.stage = 'usinage_cnc'
  ), 0)                             as cnc_cost

from nomenclatures n;

comment on view v_piece_costing_summary is
  'Totaux de chiffrage par étude : opérations, matières, total live, CNC pivot';