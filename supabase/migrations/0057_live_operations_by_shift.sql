-- ============================================================================
-- 0057_live_operations_by_shift.sql
-- Tableau de bord — Suivi en direct : refonte de v_live_operations.
--
-- AVANT (0049/0050) : la vue partait de `work_sessions` filtrées sur
-- session_type='production' et ended_at IS NULL → un ouvrier connecté au
-- Kiosk mais n'ayant pas encore démarré de tâche, OU actuellement en pause
-- (arrêt), n'apparaissait PAS dans le tableau de bord.
--
-- MAINTENANT : la vue part de `work_shifts` (= la connexion elle-même,
-- ended_at IS NULL). Tout ouvrier connecté est donc visible immédiatement,
-- avec sa session active (LATERAL JOIN, tous types confondus — production ET
-- arrêt) si elle existe, sinon avec des champs machine/projet/pièce/tâche à
-- NULL (affichés côté UI comme « connecté, en attente »). La machine du
-- kiosk par défaut (devices.default_machine_id) sert de repli quand aucune
-- session active n'a encore de machine choisie.
-- ============================================================================

drop view if exists v_live_operations;

create view v_live_operations
with (security_invoker = true) as
select
  wsh.id                                              as shift_id,
  wsh.company_id,
  wsh.started_at                                      as shift_started_at,

  w.id                                                as worker_id,
  w.full_name                                         as worker_name,

  os.id                                                as session_id,
  os.session_type,
  os.started_at                                        as started_at,

  coalesce(m.id, dm.id)                                as machine_id,
  coalesce(m.name, dm.name)                            as machine_name,

  p.id                                                  as project_id,
  p.name                                                as project_name,

  pt.id                                                 as piece_task_id,
  pt.name                                               as piece_name,

  tt.name                                               as task_type_name,
  sr.name                                               as stop_reason_name

from work_shifts wsh
join workers w on w.id = wsh.worker_id
left join lateral (
  select *
  from work_sessions s
  where s.worker_id = wsh.worker_id
    and s.ended_at is null
    and s.voided_at is null
  order by s.started_at desc
  limit 1
) os on true
left join machines m  on m.id = os.machine_id
left join devices d   on d.id = wsh.device_id
left join machines dm on dm.id = d.default_machine_id
left join projects p       on p.id = os.project_id
left join pieces_tasks pt  on pt.id = os.piece_task_id
left join task_types tt    on tt.id = os.task_type_id
left join stop_reasons sr  on sr.id = os.stop_reason_id
where wsh.ended_at is null;

comment on view v_live_operations is
  'Un ouvrier par ligne = un work_shift ouvert (connecté au Kiosk). session_type NULL = connecté sans tâche active ; ''production'' = en opération (task_type_name) ; ''downtime'' = en arrêt (stop_reason_name). machine_name retombe sur la machine par défaut du kiosk si aucune session active.';
