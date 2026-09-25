-- ============================================================================
-- 0076_nomenclature_validation_audit.sql
-- Phase 4 du chantier "Cycle de vie produit" — trace qui a validé un
-- chiffrage (nomenclatures) et quand, en plus du statut déjà existant
-- (en_attente/valide, 0053). Additif uniquement.
-- ============================================================================

alter table nomenclatures
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by_staff_id uuid references staff_users(id) on delete set null;

comment on column nomenclatures.validated_at is
  'Horodatage du clic sur "Valider" dans l''éditeur de chiffrage — NULL tant que le statut est en_attente.';
