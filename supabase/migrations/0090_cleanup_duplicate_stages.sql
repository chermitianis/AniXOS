-- ============================================================================
-- 0090_cleanup_duplicate_stages.sql
--
-- Supprime les étapes redondantes de costing :
--   - fraisage_cnc     → doublon de usinage_cnc
--   - fraisage_classique → doublon de usinage_classique
--
-- Aucune donnée existante ne les utilise (le CHECK constraint précédent les
-- refusait déjà), donc la migration est purement défensive.
-- ============================================================================

-- 1) Vérifier qu'aucune ligne n'utilise ces étapes (sécurité)
do $$
begin
  if exists (select 1 from piece_costing_operations where stage in ('fraisage_cnc', 'fraisage_classique')) then
    raise notice 'Attention : des lignes utilisent fraisage_cnc / fraisage_classique. Migration non destructive : on les convertit.';
    update piece_costing_operations
      set stage = 'usinage_cnc'
      where stage = 'fraisage_cnc';
    update piece_costing_operations
      set stage = 'usinage_classique'
      where stage = 'fraisage_classique';
  end if;
end $$;

-- 2) Recréer le CHECK constraint avec la liste finale
alter table piece_costing_operations
  drop constraint if exists piece_costing_operations_stage_check;

alter table piece_costing_operations
  add constraint piece_costing_operations_stage_check
  check (stage in (
    'usinage_cnc',
    'tournage_cnc',
    'usinage_classique',
    'tournage_classique',
    'rectification',
    'ajustage',
    'taraudage',
    'stt',
    'anodisation',
    'controle_qualite',
    'autre'
  ));

-- 3) Vérifier le résultat
select constraint_name, check_clause
from information_schema.check_constraints
where constraint_name = 'piece_costing_operations_stage_check';