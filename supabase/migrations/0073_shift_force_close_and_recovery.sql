-- ============================================================================
-- 0073_shift_force_close_and_recovery.sql
--
-- Contexte : des `work_shifts` restent ouvertes indéfiniment quand l'opérateur
-- perd l'accès à son appareil (données du navigateur effacées, appareil
-- changé/réinitialisé) sans avoir appuyé sur Déconnexion — le design actuel
-- l'empêche volontairement de se fermer "tout seul" (voir WorkerSessionContext),
-- donc il fallait une porte de sortie côté administration, absente jusqu'ici.
--
-- Ce fichier :
--   1) Ajoute sur `work_shifts` de quoi distinguer une fermeture normale
--      (déconnexion par l'opérateur) d'une fermeture administrative forcée,
--      avec motif et auteur — jamais de suppression, toujours traçable.
--   2) Ajoute un trigger de sécurité : dès que `ended_at` passe de NULL à une
--      valeur (quel que soit le chemin de code qui le fait), toute session
--      encore ouverte de cette shift est annulée (voided_at, jamais fermée
--      avec une durée fictive) et tout `shift_piece_work` ouvert est clos à
--      la même heure — filet de sécurité qui s'ajoute à la fermeture propre
--      déjà faite par endWorkerShift() côté application (donc ne fait rien
--      de plus lors d'une déconnexion normale, où il ne reste déjà rien
--      d'ouvert au moment où ce trigger s'exécute).
--   3) Corrige immédiatement les shifts actuellement bloquées en base (celles
--      signalées) en les fermant administrativement, sans deviner une heure
--      de fin arbitraire au-delà de "maintenant" + motif explicite.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Colonnes d'audit de fermeture administrative
-- ----------------------------------------------------------------------------
alter table work_shifts
  add column if not exists is_force_closed boolean not null default false,
  add column if not exists closed_by_staff_id uuid references staff_users(id) on delete set null,
  add column if not exists close_reason text;

comment on column work_shifts.is_force_closed is
  'true si la shift a été fermée depuis le Dashboard admin (session bloquée) plutôt que par le bouton Déconnexion de l''opérateur — sert à signaler ces shifts dans les rapports (fiabilité du temps mesuré non garantie sur la fin de shift).';
comment on column work_shifts.closed_by_staff_id is
  'Membre du staff qui a forcé la fermeture ; NULL pour une déconnexion normale par l''opérateur.';
comment on column work_shifts.close_reason is
  'Motif obligatoire saisi lors d''une fermeture administrative forcée.';

-- ----------------------------------------------------------------------------
-- 2) Trigger de sécurité : cascade de fermeture, quel que soit le chemin
-- ----------------------------------------------------------------------------
create or replace function close_shift_cascade()
returns trigger as $$
declare
  r record;
  effective_reason text;
begin
  if old.ended_at is null and new.ended_at is not null then
    effective_reason := coalesce(new.close_reason, 'Fermeture de la session (déconnexion)');

    for r in
      select * from work_sessions
      where shift_id = new.id and ended_at is null and voided_at is null
    loop
      update work_sessions
      set voided_at = new.ended_at,
          voided_by_staff_id = new.closed_by_staff_id,
          void_reason = effective_reason
      where id = r.id;

      insert into work_session_corrections (
        id, company_id, work_session_id, action,
        corrected_by_type, corrected_by_staff_id, corrected_by_worker_id,
        reason, old_started_at, old_ended_at, old_duration_seconds,
        new_started_at, new_ended_at, new_duration_seconds, created_at
      ) values (
        gen_random_uuid(), new.company_id, r.id, 'void',
        case when new.closed_by_staff_id is not null then 'staff' else 'worker' end,
        new.closed_by_staff_id, null,
        effective_reason,
        r.started_at, r.ended_at, r.duration_seconds,
        r.started_at, null, null, now()
      );
    end loop;

    update shift_piece_work
    set ended_at = new.ended_at
    where shift_id = new.id and ended_at is null;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_close_shift_cascade on work_shifts;
create trigger trg_close_shift_cascade
after update on work_shifts
for each row execute function close_shift_cascade();

comment on trigger trg_close_shift_cascade on work_shifts is
  'Filet de sécurité : à la fermeture d''une shift (peu importe le chemin), annule proprement toute session/shift_piece_work encore ouverte au lieu de les laisser bloquées indéfiniment.';

-- ----------------------------------------------------------------------------
-- 3) Correction immédiate des shifts actuellement bloquées
-- ----------------------------------------------------------------------------
update work_shifts
set ended_at = now(),
    is_force_closed = true,
    close_reason = 'Correction automatique (migration 0073) — session restée ouverte avant la mise en place de la fermeture administrative. À vérifier si nécessaire dans les rapports de la période concernée.'
where ended_at is null;
