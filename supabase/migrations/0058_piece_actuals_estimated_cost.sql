-- ============================================================================
-- 0058_piece_actuals_estimated_cost.sql
-- Rapport final projet (ProjectReportModal, ouvert depuis Rapports → Projets) :
-- la comparaison estimé/réel n'affichait que le TEMPS estimé face au COÛT réel
-- — aucune colonne "coût estimé" n'existait pour une comparaison directe.
-- On expose ici pieces_tasks.cnc_estimated_cost (alimenté automatiquement
-- depuis l'étude de coût validée, migration 0055) dans v_piece_task_actuals,
-- en ajout de colonne pur (CREATE OR REPLACE VIEW : ordre des colonnes
-- existantes inchangé, donc sans risque pour les lecteurs actuels de la vue).
-- ============================================================================

create or replace view v_piece_task_actuals
with (security_invoker = true) as
select
  pt.id                 as piece_task_id,
  pt.company_id,
  pt.project_id,
  pt.manufacturing_order_id,
  pt.name                as piece_name,
  pt.phase,
  pt.status,
  pt.estimated_time_minutes,
  pt.sequence_order,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'production'), 0) / 60.0
    as actual_time_minutes,

  coalesce(sum(ws.duration_seconds) filter (where ws.session_type = 'downtime'), 0) / 60.0
    as downtime_minutes,

  coalesce(sum(
    (ws.duration_seconds / 3600.0) * w.hourly_cost
  ) filter (where ws.session_type = 'production'), 0) as actual_cost,

  count(distinct ws.worker_id) filter (where ws.session_type = 'production') as workers_involved,

  -- Coût usinage CNC estimé, calculé automatiquement depuis l'étude de coût
  -- validée (migration 0055/0057) : base de comparaison directe avec actual_cost
  pt.cnc_estimated_cost as estimated_cost

from pieces_tasks pt
left join work_sessions ws on ws.piece_task_id = pt.id and ws.ended_at is not null and ws.voided_at is null
left join workers w on w.id = ws.worker_id
group by pt.id, pt.company_id, pt.project_id, pt.manufacturing_order_id, pt.name, pt.phase,
         pt.status, pt.estimated_time_minutes, pt.sequence_order, pt.cnc_estimated_cost;

comment on view v_piece_task_actuals is
  'Le temps/coût réels de chaque pièce (exclut les événements annulés) + le coût estimé (usinage CNC, depuis l''étude de coût) pour comparaison directe estimé/réel dans le rapport final projet.';
