-- ============================================================================
-- 0064_worker_planning_qr.sql
--
-- Support de la PWA "Planning opérateur" (/planning) — Mission 1.
--
-- Un seul code QR par entreprise (pas un par opérateur) : il sert de clé
-- d'accès en lecture seule au planning des machines depuis le téléphone
-- personnel de n'importe quel opérateur, en dehors même du Kiosk et des
-- heures de travail. Ce n'est PAS un mécanisme d'identification individuelle
-- ni une source de données pour les rapports — uniquement un canal de
-- communication à sens unique (Entreprise → Opérateurs).
--
-- Sécurité :
--   - Le secret est lisible uniquement par le propriétaire du compte
--     (même pattern que odoo_config, cf. 0015/0017) : personne d'autre côté
--     client ne peut le consulter, y compris un autre membre du staff.
--   - La régénération ("recréer") écrase le secret existant → invalide
--     instantanément l'ancien QR pour TOUS les téléphones déjà connectés,
--     car l'Edge Function `worker-planning-access` revalide ce secret à
--     CHAQUE requête (pas de session Supabase Auth persistante créée pour
--     les téléphones opérateurs — volontairement, pour permettre cette
--     révocation immédiate et éviter de multiplier les comptes auth.users).
-- ============================================================================

create table if not exists planning_qr_codes (
  company_id        uuid primary key references companies(id) on delete cascade,

  qr_secret         text not null,
  generated_at      timestamptz not null default now(),
  regenerate_count  integer not null default 0
);

comment on table planning_qr_codes is
  'Secret QR unique par entreprise pour l''accès en lecture seule au Planning PWA opérateur (/planning). Régénérable par le propriétaire ; la régénération révoque immédiatement l''ancien code.';

alter table planning_qr_codes enable row level security;

-- Lecture/écriture réservées au propriétaire du compte, exactement comme
-- odoo_config (0017_rls_policies.sql) — réduction maximale de la surface
-- d'attaque sur un secret sensible.
create policy planning_qr_codes_select on planning_qr_codes
  for select using (is_my_company_owner(company_id));

create policy planning_qr_codes_insert on planning_qr_codes
  for insert with check (is_my_company_owner(company_id));

create policy planning_qr_codes_update on planning_qr_codes
  for update using (is_my_company_owner(company_id));
