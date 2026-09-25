-- ============================================================================
-- 0084_crm_integration_fix.sql
--
-- Harmonise la création de projets via CRM avec le workflow Ingénierie :
--   - Les projets issus de CRM démarrent en 'draft' (au lieu de 'planned')
--   - Le code est généré par le trigger 0077 (PRJ-YYYY-NNNN)
--   - quoted_price = estimated_value du prospect
--   - estimated_cost reste NULL (calculé en Ingénierie)
--
-- Non destructif : aucune donnée existante modifiée.
-- ============================================================================

-- Aucune modification de schéma nécessaire.
-- Ce fichier est un marqueur documentaire.

-- Vérification : la contrainte doit déjà contenir 'draft' et NE PAS contenir 'planned'
-- (déjà appliqué dans 0079/0080). Rien à faire.

comment on table projects is
  'Projets : démarrent en draft (issus de CRM ou créés manuellement), progressent via le workflow Ingénierie (studying → approved → ready_for_production), puis Production.';