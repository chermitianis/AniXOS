-- ============================================================================
-- 0077_unique_codes_and_lifecycle.sql
--
-- 1. Génération auto de codes uniques (PRJ-YYYY-NNNN, PCE-YYYY-NNNN)
-- 2. projects.code et pieces_tasks.code → nullables (trigger les remplit)
-- 3. UNIQUE(company_id, code) sur pieces_tasks
-- 4. Lien nomenclature ↔ projects / pieces_tasks
--
-- Non destructif : aucune donnée existante supprimée ou modifiée.
-- ============================================================================

-- 1) Séquences (par entreprise, par type, par année)
create table if not exists code_sequences (
  company_id  uuid    not null references companies(id) on delete cascade,
  entity_type text    not null,
  year        integer not null,
  last_number integer not null default 0,
  primary key (company_id, entity_type, year)
);

comment on table code_sequences is
  'Compteurs de codes uniques (projects, pieces) — un par entreprise/type/année.';

-- 2) Générateur générique
create or replace function generate_entity_code(
  p_company_id uuid,
  p_entity_type text,
  p_prefix text
)
returns text
language plpgsql
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_next integer;
begin
  insert into code_sequences (company_id, entity_type, year, last_number)
  values (p_company_id, p_entity_type, v_year, 1)
  on conflict (company_id, entity_type, year)
  do update set last_number = code_sequences.last_number + 1
  returning last_number into v_next;

  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- 3) Trigger : projects
create or replace function trg_projects_assign_code()
returns trigger
language plpgsql
as $$
begin
  if (new.code is null or new.code = '') and new.company_id is not null then
    new.code := generate_entity_code(new.company_id, 'project', 'PRJ');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_assign_code on projects;
create trigger trg_projects_assign_code
before insert on projects
for each row execute function trg_projects_assign_code();

-- 4) Trigger : pieces_tasks
create or replace function trg_pieces_tasks_assign_code()
returns trigger
language plpgsql
as $$
begin
  if (new.code is null or new.code = '') and new.company_id is not null then
    new.code := generate_entity_code(new.company_id, 'piece', 'PCE');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pieces_tasks_assign_code on pieces_tasks;
create trigger trg_pieces_tasks_assign_code
before insert on pieces_tasks
for each row execute function trg_pieces_tasks_assign_code();

-- 5) Code nullable (le trigger le remplit avant insertion)
alter table projects     alter column code drop not null;
alter table pieces_tasks alter column code drop not null;

-- 6) Unicité des codes de pièces (par entreprise)
alter table pieces_tasks
  drop constraint if exists pieces_tasks_company_code_unique;
alter table pieces_tasks
  add constraint pieces_tasks_company_code_unique
  unique (company_id, code);

-- 7) Lien nomenclature ↔ exécution
alter table projects
  add column if not exists nomenclature_id uuid references nomenclatures(id) on delete set null;
alter table pieces_tasks
  add column if not exists nomenclature_id uuid references nomenclatures(id) on delete set null;

create index if not exists idx_projects_nomenclature
  on projects (nomenclature_id) where nomenclature_id is not null;
create index if not exists idx_pieces_tasks_nomenclature
  on pieces_tasks (nomenclature_id) where nomenclature_id is not null;