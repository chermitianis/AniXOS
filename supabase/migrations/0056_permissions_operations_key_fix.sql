-- ============================================================================
-- 0056_permissions_operations_key_fix.sql
-- CORRECTIF : la page "Types de tâches" + "Causes d'arrêt" a été fusionnée en
-- une seule page "Opérations & Arrêts" (clé de navigation `operations`,
-- migration/tâche précédente), mais la clé de permission correspondante dans
-- `roles.permissions` était restée sur les deux anciennes clés `task_types` /
-- `stop_reasons` (absentes de PERMISSION_MODULES depuis la fusion). Résultat
-- concret : impossible d'accorder à un rôle non-propriétaire l'accès à cette
-- page depuis l'éditeur de rôles, et tout rôle qui l'avait avant la fusion la
-- perdait silencieusement.
--
-- On fusionne les droits des deux anciennes clés (union des actions) dans une
-- nouvelle clé `operations`, sur TOUTES les lignes de `roles` (modèles
-- company_id IS NULL + rôles déjà clonés par entreprise), puis on retire les
-- anciennes clés. Idempotent : sans effet si aucune des deux clés n'existe.
-- ============================================================================

update roles
set permissions =
  (permissions - 'task_types' - 'stop_reasons')
  || jsonb_build_object(
       'operations',
       to_jsonb(array(
         select distinct action
         from jsonb_array_elements_text(
           coalesce(permissions -> 'operations', '[]'::jsonb)
           || coalesce(permissions -> 'task_types', '[]'::jsonb)
           || coalesce(permissions -> 'stop_reasons', '[]'::jsonb)
         ) as action
       ))
     )
where permissions ? 'task_types' or permissions ? 'stop_reasons';
