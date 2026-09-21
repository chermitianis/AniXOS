-- ============================================================================
-- 0055_nomenclature_stages_and_cnc.sql
-- Étude du projet (Nomenclature) — professionnalisation :
--   1) CORRECTIF CRITIQUE : le CHECK sur column_type (posé par 0029) n'autorisait
--      que 8 valeurs, alors que defaultTemplate.ts insère depuis toujours des
--      colonnes 'formula' et 'select' → l'insertion du modèle standard (25
--      colonnes) violait ce CHECK et échouait silencieusement (0 colonne créée
--      pour toute nouvelle étude, ou au clic sur "Réinitialiser au modèle
--      standard"). On aligne le CHECK sur les 12 types réellement utilisés par
--      le frontend (NomenclatureColumnType).
--   2) Ajout de `stage` sur nomenclature_columns : tague une colonne comme
--      appartenant à l'une des 5 étapes de production métier (usinage CNC,
--      tournage, ajustage, STT, anodisation) pour permettre la mise en
--      évidence visuelle et le sous-total automatique par étape.
--   3) Ajout de `cnc_estimated_hours` / `cnc_estimated_cost` sur pieces_tasks :
--      alimentés automatiquement depuis la colonne "usinage CNC" de l'étude
--      (étape pivot de l'application) à chaque enregistrement/validation, puis
--      répercutés sur `estimated_time_minutes` (déjà utilisé partout ailleurs :
--      Kiosk, rapports, sélecteur de pièces) — aucune autre section du code
--      n'a donc besoin d'être modifiée pour bénéficier de la valeur affinée.
-- ============================================================================

alter table nomenclature_columns
  drop constraint if exists nomenclature_columns_column_type_check;

alter table nomenclature_columns
  add constraint nomenclature_columns_column_type_check
  check (column_type in (
    'material', 'unit', 'currency', 'value', 'name', 'operation',
    'text', 'number', 'boolean', 'date', 'select', 'formula'
  ));

alter table nomenclature_columns
  add column if not exists stage text
    check (stage in ('usinage_cnc', 'tournage', 'ajustage', 'stt', 'anodisation'));

comment on column nomenclature_columns.stage is
  'Étape de production métier à laquelle appartient cette colonne (mise en évidence + sous-total automatique). usinage_cnc est l''étape pivot de l''application.';

create index if not exists idx_nomenclature_columns_stage
  on nomenclature_columns (nomenclature_id, stage)
  where stage is not null;

-- ------------------------------------------------------------------
alter table pieces_tasks
  add column if not exists cnc_estimated_hours numeric(10,2),
  add column if not exists cnc_estimated_cost  numeric(12,2);

comment on column pieces_tasks.cnc_estimated_hours is
  'Heures usinage CNC calculées automatiquement depuis l''étude de coût validée (colonnes tagged stage=usinage_cnc) ; source de vérité pour estimated_time_minutes une fois l''étude renseignée.';
comment on column pieces_tasks.cnc_estimated_cost is
  'Coût usinage CNC (heures × prix/h) calculé automatiquement depuis l''étude de coût ; référence pour la rentabilité et les rapports.';
