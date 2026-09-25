-- ============================================================================
-- 0075_crm_opportunity_fields.sql
-- Phase 2 du chantier "Cycle de vie produit" — complète crm_prospects avec
-- les champs attendus pour une fiche "Opportunité" complète (spécification
-- utilisateur, section 1) : contact distinct de l'entreprise, priorité,
-- date souhaitée par le client. Additif uniquement.
-- ============================================================================

alter table crm_prospects
  add column if not exists contact_person text,
  add column if not exists priority text not null default 'normale'
    check (priority in ('basse', 'normale', 'haute', 'urgente')),
  add column if not exists requested_date date;

comment on column crm_prospects.contact_person is
  'Personne de contact chez le prospect, distincte du nom de l''entreprise (company_name) ou du nom saisi (full_name).';
comment on column crm_prospects.requested_date is
  'Date souhaitée par le client pour la livraison/réalisation — distincte de expected_close_at (date de clôture prévue de la négociation).';

create index if not exists idx_crm_prospects_priority
  on crm_prospects (company_id, priority)
  where stage not in ('gagne', 'perdu');
