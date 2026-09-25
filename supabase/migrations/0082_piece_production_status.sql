-- ============================================================================
-- 0082_piece_production_status.sql
-- Ajoute un statut de production par pièce : la pièce est l'unité envoyée
-- en production, pas le projet. Le projet suit automatiquement.
-- ============================================================================

alter table pieces_tasks
  add column if not exists production_status text not null default 'not_sent'
  check (production_status in ('not_sent', 'sent'));

alter table pieces_tasks
  add column if not exists sent_to_production_at timestamptz;

create index if not exists idx_pieces_tasks_production_status
  on pieces_tasks (company_id, production_status);

comment on column pieces_tasks.production_status is
  'Statut d''envoi en production au niveau pièce. Le projet passe à ready_for_production quand toutes ses pièces sont sent.';