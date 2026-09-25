-- ============================================================================
-- 0088_machines_interface_type.sql
--
-- Ajoute un type d'interface à chaque machine : CNC ou Manuel.
-- Sert à filtrer les machines proposées pour chaque opération en préparation.
-- ============================================================================

alter table machines
  add column if not exists interface_type text not null default 'manual'
  check (interface_type in ('cnc', 'manual', 'both'));

comment on column machines.interface_type is
  'Type d''interface pour cette machine : cnc (commande numérique), manual (machine conventionnelle), both (rare). Détermine quelles opérations peuvent y être affectées.';

create index if not exists idx_machines_interface_type
  on machines (company_id, interface_type);