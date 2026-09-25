-- ============================================================================
-- 0074_lifecycle_links.sql
--
-- Phase 1 du chantier "Cycle de vie produit" (CRM → Livraison, cf.
-- docs/ROADMAP_product_lifecycle.md). Ajoute uniquement les liens manquants
-- pour rendre la chaîne de traçabilité possible :
--
--   clients ─> crm_prospects ─> quotes ─┐
--       │           │                    │
--       │           └─> nomenclatures ───┤
--       └───────────────────────────────> projects ─> ... ─> invoices
--
-- Règle d'or : aucune duplication de données. Toutes les colonnes ajoutées
-- ici sont nullable et purement additives — aucune table, colonne ou
-- contrainte existante n'est supprimée ou durcie.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Pipeline CRM : extension non-destructive des étapes
--    (0068 avait : nouveau, contacte, negociation, gagne, perdu)
--    Cible utilisateur : Nouveau → Qualification → Étude → Chiffrage →
--    Offre → Négociation → Gagné/Perdu
--    "contacte" est conservé (compat arrière) mais n'est plus utilisé par
--    le pipeline visuel à partir de la Phase 2.
-- ----------------------------------------------------------------------------
alter table crm_prospects
  drop constraint if exists crm_prospects_stage_check;

alter table crm_prospects
  add constraint crm_prospects_stage_check
  check (stage in (
    'nouveau', 'qualification', 'contacte', 'etude', 'chiffrage',
    'offre', 'negociation', 'gagne', 'perdu'
  ));

-- ----------------------------------------------------------------------------
-- 2) projects ─> crm_prospects : un Production Project garde la mémoire de
--    l'opportunité CRM dont il est issu (Phase 3 : conversion Gagné→Project).
-- ----------------------------------------------------------------------------
alter table projects
  add column if not exists opportunity_id uuid references crm_prospects(id) on delete set null;

comment on column projects.opportunity_id is
  'Opportunité CRM d''origine (crm_prospects) — NULL si le projet a été créé directement sans passer par le CRM. Permet de remonter du projet à la demande commerciale initiale sans ressaisie.';

create index if not exists idx_projects_opportunity
  on projects (opportunity_id)
  where opportunity_id is not null;

-- ----------------------------------------------------------------------------
-- 3) quotes ─> crm_prospects / nomenclatures : le devis garde la trace de
--    l'opportunité et de l'étude de coût qui l'ont produit (Phase 5).
-- ----------------------------------------------------------------------------
alter table quotes
  add column if not exists prospect_id uuid references crm_prospects(id) on delete set null,
  add column if not exists nomenclature_id uuid references nomenclatures(id) on delete set null;

comment on column quotes.prospect_id is
  'Opportunité CRM à l''origine de ce devis — évite de ressaisir les informations client/besoin déjà capturées dans crm_prospects.';
comment on column quotes.nomenclature_id is
  'Étude de chiffrage (nomenclatures) dont les totaux ont servi à établir ce devis.';

create index if not exists idx_quotes_prospect on quotes (prospect_id) where prospect_id is not null;
create index if not exists idx_quotes_nomenclature on quotes (nomenclature_id) where nomenclature_id is not null;

-- ----------------------------------------------------------------------------
-- 4) nomenclatures : emplacement pour le coût réel, en plus de l'estimé déjà
--    existant (total_estimated_cost) — permet la comparaison Estimated vs
--    Actual demandée. Le calcul depuis work_sessions/work_session viendra en
--    Phase 8 ; ici on ne fait que préparer le stockage.
-- ----------------------------------------------------------------------------
alter table nomenclatures
  add column if not exists total_actual_cost numeric(14,2),
  add column if not exists actual_cost_updated_at timestamptz;

comment on column nomenclatures.total_actual_cost is
  'Coût réel constaté après production (calculé en Phase 8 à partir des données d''exécution atelier) — NULL tant que le projet n''est pas clôturé ou pas encore calculé.';

-- ----------------------------------------------------------------------------
-- 5) invoices ─> projects : permet de facturer un projet sans ressaisir ses
--    informations, et de clôturer un projet en connaissant sa facturation.
-- ----------------------------------------------------------------------------
alter table invoices
  add column if not exists project_id uuid references projects(id) on delete set null;

comment on column invoices.project_id is
  'Projet de production facturé — NULL pour une facture sans lien direct à un projet (cas déjà existant, conservé).';

create index if not exists idx_invoices_project on invoices (project_id) where project_id is not null;
