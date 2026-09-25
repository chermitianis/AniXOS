-- ============================================================================
-- 0083_engineering_optional_enrichment.sql
--
-- Enrichissement OPTIONNEL de la pièce côté Ingénierie :
--   - Documents techniques (URL-based, pas d'upload Storage)
--   - Enrichissement des opérations de chiffrage avec machine + outil
--   - Statut de validation technique (indépendant du workflow production)
--
-- Aucune contrainte bloquante : une pièce peut entrer en production sans
-- ces enrichissements. Ils viennent compléter l'OF a posteriori.
-- ============================================================================

-- 1) Documents techniques (par URL, pas de Storage)
create table if not exists piece_documents (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  piece_task_id   uuid not null references pieces_tasks(id) on delete cascade,
  doc_type        text not null check (doc_type in ('plan', 'cad', 'cam', 'cnc_program', 'notice', 'other')),
  title           text not null,
  url             text not null,
  notes           text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_piece_documents_company on piece_documents (company_id);
create index if not exists idx_piece_documents_piece on piece_documents (piece_task_id);

create trigger trg_piece_documents_updated_at
  before update on piece_documents
  for each row execute function set_updated_at();

comment on table piece_documents is
  'Documents techniques optionnels attachés à une pièce (plans, CAD, CAM, programmes CNC). URL externes — pas d''upload Storage.';

-- 2) Enrichissement des opérations de chiffrage (machine + outil prévus)
alter table piece_costing_operations
  add column if not exists machine_id uuid references machines(id) on delete set null;

-- 3) Statut de validation technique (facultatif)
alter table pieces_tasks
  add column if not exists technical_status text not null default 'pending'
  check (technical_status in ('pending', 'approved'));

alter table pieces_tasks
  add column if not exists technical_validated_at timestamptz,
  add column if not exists technical_notes text;

create index if not exists idx_pieces_tasks_technical_status
  on pieces_tasks (company_id, technical_status);

comment on column pieces_tasks.technical_status is
  'Validation technique optionnelle. Indépendant du workflow production : une pièce peut être envoyée en production avec technical_status = pending.';