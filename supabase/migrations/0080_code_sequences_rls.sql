-- ============================================================================
-- 0080_code_sequences_rls.sql
--
-- Le tableau code_sequences est un compteur interne utilisé uniquement par
-- les triggers de génération de codes (PRJ-*, PCE-*). Il ne doit jamais être
-- lu ou écrit directement par un client.
--
-- Solution : on active RLS mais on n'accorde AUCUNE policy au client.
-- Les triggers côté serveur fonctionnent indépendamment de RLS (ils sont
-- exécutés dans le contexte du propriétaire de la fonction SQL).
-- ============================================================================

alter table code_sequences enable row level security;

-- Aucune policy : la table est totalement inaccessible via PostgREST.
-- Les fonctions SQL (generate_entity_code) continuent de fonctionner car
-- elles s'exécutent avec les privilèges élevés du owner.

-- Mais pour être sûrs que la fonction peut écrire, on la marque
-- explicitement SECURITY DEFINER (bonne pratique).
alter function generate_entity_code(uuid, text, text) security definer;
alter function trg_projects_assign_code() security definer;
alter function trg_pieces_tasks_assign_code() security definer;