
---

# PARTIE 2/2 — Références techniques

## 8. Base de données (ERD)

### 8.1 Structure générale

La base de données repose sur **~40 tables** (incluant les tables de service comme `accounts`, `databases`, `account_events`, `platform_settings`, etc.). Toutes les tables métier portent `company_id` et sont protégées par RLS.

### 8.2 Schéma relationnel (vue simplifiée)

NIVEAU COMPTE (multi-tenant)
════════════════════════════
auth.users (Supabase)
   │
   └─1:1─> accounts
              │
              ├─1:N─> databases ──> companies
              │
              └─1:N─> staff_users ──> companies

NIVEAU ENTREPRISE (par company_id)
═══════════════════════════════════
companies
   │
   ├─> roles (company_id NULL = template | sinon rôle custom)
   ├─> staff_users ──> roles
   ├─> devices (auth_user_id optionnel, pour Kiosk)
   ├─> workers (sans auth.users — login applicatif)
   ├─> machines
   ├─> clients
   ├─> task_types
   ├─> stop_reasons
   ├─> odoo_config (owner only)
   │
   ├─> quotes ──> quote_items
   │      │
   │      └─(accept-quote)─> projects ──> manufacturing_orders
   │                            │             │
   │                            │             └─> pieces_tasks
   │                            │
   │                            ├─> invoices ──> invoice_items
   │                            │
   │                            └─> nomenclatures
   │                                   ├─> nomenclature_columns
   │                                   ├─> nomenclature_rows
   │                                   └─> nomenclature_cells
   │
   ├─> planning (worker + machine + project + piece + date + shift_number + MO)
   │
   ├─> work_shifts (login → logout)
   │      │
   │      └─> work_sessions (production | downtime)
   │             │
   │             ├─> task_types (si production)
   │             ├─> stop_reasons (si downtime)
   │             │
   │             └─> activity_log (journal temps réel)
   │
   ├─> inventory_items ──> inventory_transactions
   │
   ├─> piece_handoffs
   ├─> shift_piece_work
   ├─> work_session_corrections
   ├─> machine_maintenance_log
   ├─> machine_tools
   ├─> workshop_reclamations
   │
   └─> account_events (niveau account, pas company)

### 8.3 Contraintes et triggers clés

**Contraintes** :
- `idx_work_sessions_one_open_per_worker` : une seule `work_session` ouverte par worker (`ended_at IS NULL`)
- `UNIQUE(nomenclature_id, piece_task_id)` : empêche les doublons d'import de pièces
- `UNIQUE(account_id, name)` sur `databases` : noms uniques par compte
- `UNIQUE(account_id, company_id)` sur `databases` : une company = une database
- `UNIQUE(row_id, column_id)` sur `nomenclature_cells`

**Triggers** :
- `apply_inventory_transaction` : met à jour `quantity_on_hand` à chaque transaction
- `recalc_completion_after_piece_update` : recalcule le statut des MO + projets après chaque mise à jour de pièce
- Trigger de limite `max_databases` sur `databases`
- Trigger de protection des champs sensibles sur `accounts`
- `computeNextOrderNumber()` : numérotation automatique des ordres de fabrication

### 8.4 Views principales

| View | Rôle |
|---|---|
| `v_project_actuals` | Temps/coût réels par projet depuis `work_sessions` |
| `v_project_profitability` | Bénéfice net + écart de temps + statut risque |
| `v_piece_task_actuals` | Analyse au niveau pièce (avec `estimated_cost` depuis 0058) |
| `v_live_operations` | Sessions ouvertes en temps réel (basé sur `work_shifts` depuis 0057) |
| `v_inventory_low_stock` | Articles sous le seuil de réapprovisionnement |
| `v_machine_planning_overview` | Planning par machine + worker + shift_number |
| `v_shift_report`, `v_shift_piece_summary`, `v_shift_session_detail` | Rapports de shifts |
| `v_machine_report` | Rapport machine (créé en 0061) |

**Note** : toutes les views utilisent `security_invoker = true` — elles héritent des permissions de l'appelant.

### 8.5 Données soumises à des contraintes strictes

| Table | Contrainte | Raison |
|---|---|---|
| `workers` | `password_hash` illisible via RLS | Sécurité |
| `staff_users` | `password_hash` illisible via RLS | Sécurité |
| `inventory_transactions` | Pas d'UPDATE/DELETE | Audit permanent |
| `activity_log` | Pas d'UPDATE/DELETE | Journal immuable |
| `accounts` | Champs sensibles protégés par trigger | Anti-tamper |

---


## 9. Migrations (index)

### 9.1 Vue d'ensemble

**Total** : ~55 fichiers SQL dans `supabase/migrations/`, numérotés de `0001` à `0063`.

**Zone grise** : `0033-0040` (numéros manquants — fichiers fusionnés ou supprimés historiquement).

### 9.2 Groupes fonctionnels

**Groupe 1 — Fondations (0001-0015)** :
- `0001_companies.sql` : table company (racine du tenant)
- `0002_roles_permissions.sql` : rôles + templates
- `0003_staff_users.sql` : employés
- `0004_devices.sql` : devices Kiosk/Admin
- `0005_workers.sql` : opérateurs
- `0006_machines.sql`
- `0007_clients.sql`
- `0008_projects.sql`
- `0009_pieces_tasks.sql`
- `0010_task_types.sql`
- `0011_stop_reasons.sql`
- `0012_planning.sql`
- `0013_work_sessions.sql`
- `0014_activity_log.sql`
- `0015_odoo_config.sql`

**Groupe 2 — Sécurité RLS (0016-0019)** :
- `0016_rls_helpers.sql` : `get_my_company_id()` etc.
- `0017_rls_policies.sql` : policies sur toutes les tables
- `0018_worker_login_security.sql`
- `0019_workers_column_security.sql`

**Groupe 3 — Modules métier (0020-0028)** :
- `0020_manufacturing_orders.sql`
- `0021_inventory.sql`
- `0022_sales.sql` (quotes, invoices)
- `0023_new_tables_rls.sql`
- `0024_reports_views.sql`
- `0025_workflow_linkage_columns.sql`
- `0026_completion_triggers.sql`
- `0027_piece_actuals_view.sql`
- `0028_subscription_trial.sql`

**Groupe 4 — Nomenclature + Kiosk tools (0029-0032)** :
- `0029_nomenclature.sql`
- `0030_nomenclature_rls.sql`
- `0031_kiosk_tools_and_handoffs.sql`
- `0032_machine_tools_and_handoffs.sql`

**Groupe 5 — Corrections & features (0041-0058)** :
- `0041_french_company_roles.sql`
- `0042_fix_role_rls_and_backfill.sql`
- `0043_fix_machine_tools_schema.sql`
- `0044_shifts_corrections_realtime.sql`
- `0045_unify_machine_tool_count.sql`
- `0046_shift_session_detail_view.sql`
- `0047_shift_piece_work.sql`
- `0048_tool_length_material_reclamations_maintenance.sql`
- `0049_live_operations_production_only.sql`
- `0050_live_operations_add_piece.sql`
- `0051_workshop_reclamations_read_tracking.sql`
- `0052_clients_auto_code.sql`
- `0053_nomenclature_costing.sql`
- `0054_planning_shift_and_mo.sql`
- `0055_nomenclature_stages_and_cnc.sql`
- `0056_permissions_operations_key_fix.sql`
- `0057_live_operations_by_shift.sql`
- `0058_piece_actuals_estimated_cost.sql`

**Groupe 6 — Multi-tenant + Production (0059-0063)** :
- `0059_accounts_and_databases.sql` : **REFONTE MAJEURE** (accounts, databases, auth_user_id)
- `0060_platform_settings.sql`
- `0061_machine_report_view.sql`
- `0062_fix_auth_company_id.sql` : correction `auth_user_id`
- `0063_harden_insert_policies.sql` : **durcissement INSERT**

### 9.3 Migrations critiques à ne jamais oublier

| Migration | Rôle critique |
|---|---|
| `0016_rls_helpers.sql` | Définit `get_my_company_id()` — base de toute la sécurité |
| `0026_completion_triggers.sql` | Automatisation de la complétion projet/MO |
| `0059_accounts_and_databases.sql` | Refonte architecturale (multi-databases) |
| `0062_fix_auth_company_id.sql` | Correction sécurité `auth_user_id` |
| `0063_harden_insert_policies.sql` | Durcissement RLS sur INSERT |

---

## 10. Edge Functions (index)

### 10.1 Liste complète

**Total** : 14 Edge Functions dans `supabase/functions/`.

### 10.2 Détail par rôle

**Authentification & Comptes** :
- `create-account` : création atomique d'un compte (9 champs, rollback complet)
- `staff-invite` : invitation d'un employé via Supabase Auth
- `dev-delete-account` : (Developer) suppression d'un compte client
- `dev-update-account` : (Developer) modification d'un compte client

**Multi-databases** :
- `create-database` : création d'une database supplémentaire (avec limite `max_databases`)
- `delete-database` : suppression d'une database (avec garde-fous : pas la base active, pas la dernière)

**Abonnements (Paddle)** :
- `create-checkout-session` : démarre un paiement Paddle
- `paddle-webhook` : reçoit les webhooks Paddle (vérification HMAC)

**Devices & Kiosk** :
- `register-device` : enregistre un device (Kiosk ou Admin) — owner only
- `kiosk-credentials-sync` : synchronise les credentials workers locaux du Kiosk
- `worker-login` : authentifie un opérateur (session logique, pas auth.users)

**Métier** :
- `accept-quote` : accepte un devis → crée projet + ordre de fabrication
- `generate-invoice` : génère une facture PDF
- `tenant-provisioning` : **obsolète** (remplacé par `create-account`)

### 10.3 Edge Functions à créer (Roadmap)

| Function | Pour | Mission |
|---|---|---|
| `generate-worker-qr` | Génère le QR token d'un worker | Mission 1 (PWA) |

### 10.4 Pattern commun des Edge Functions

Toutes les Edge Functions suivent le même pattern :
1. Gestion du CORS (preflight `OPTIONS`)
2. Vérification du header `Authorization`
3. Extraction de l'utilisateur (`auth.getUser()`)
4. Vérification des permissions (ex. `staff_users.is_owner`)
5. Opération métier
6. Rollback en cas d'échec
7. Retour JSON standardisé : `{ success: true, ... }` ou `{ error: "...", message: "..." }`

---


## 11. Système d'abonnement + Paddle

### 11.1 Architecture d'abonnement

Depuis la migration `0059`, le statut d'abonnement est stocké dans `accounts` (niveau propriétaire), pas dans `companies`. Un seul abonnement couvre toutes les databases d'un compte.

**Table `accounts` — colonnes clés liées à l'abonnement** :

| Colonne | Type | Rôle |
|---|---|---|
| `subscription_status` | text | `trial` / `active` / `expired` / `suspended` / `cancelled` |
| `plan` | text | `trial` / `standard` / `premium` |
| `billing_cycle` | text | `monthly` / `yearly` / NULL |
| `trial_ends_at` | timestamptz | Fin de l'essai gratuit (60 jours par défaut) |
| `current_period_end` | timestamptz | Fin de la période payée actuelle |
| `paddle_customer_id` | text | Identifiant Paddle du client |
| `paddle_subscription_id` | text | Identifiant Paddle de l'abonnement |
| `suspended_by_admin` | boolean | Suspendu manuellement par le développeur |
| `max_databases` | integer | 5 (Standard/Premium), 999 (Developer) |

### 11.2 Les 3 plans

| Plan | Prix mensuel | Prix annuel | Databases max | Employés max | Fonctionnalités |
|---|---|---|---|---|---|
| **Trial** | 0 | 0 | 1 | 10 | Fonctionnalités de base |
| **Standard** | 29-59 TND | 290 TND | 3 | 20 | Support email + PWA |
| **Premium** | 79 TND | 790 TND | 5 | 50 | Support prioritaire + QR Code + Odoo (à venir) |

### 11.3 Cycle de vie d'un abonnement

INSCRIPTION
   ↓
Trial (60 jours) ──[dépassement]──> Expired
   ↓
   [Souscription]
   ↓
Active ──[annulation]──> Cancelled
   ↓
   [échec paiement]
   ↓
Expired

[Developer] Suspended (action manuelle, override tout)

### 11.4 SubscriptionGate

Le composant `apps/web/src/app/SubscriptionGate.tsx` vérifie le statut à chaque ouverture de session :

- **`trial` actif** → accès normal + banner "X jours restants"
- **`trial` expiré** → page "Abonnement requis" + blocage de TOUTES les databases
- **`active`** → accès normal
- **`expired` / `suspended` / `cancelled`** → page de blocage + lien de renouvellement
- **Developer** → bypass complet

**Politique de non-suppression** : aucune donnée n'est supprimée lors d'un passage en `expired`. Toutes les données restent intactes et redeviennent accessibles dès le renouvellement.

### 11.5 Intégration Paddle

**Environnement actuel** : **Sandbox** (`VITE_PADDLE_ENV=sandbox`)

**Flux de paiement** :

1. Client clique sur "Choisir ce plan" dans `SubscriptionPage`
2. Appel de `create-checkout-session` Edge Function
3. Edge Function contacte l'API Paddle → crée une checkout session
4. Retour de `checkout_url` au frontend
5. Redirection vers Paddle Checkout
6. Client saisit sa carte
7. Paddle envoie webhook à `paddle-webhook` (6 événements configurés)
8. Edge Function met à jour `accounts.subscription_status` + `plan` + `current_period_end`
9. `SubscriptionGate` détecte le changement → accès débloqué

**Webhooks supportés** :
- `subscription.created`
- `subscription.updated`
- `subscription.cancelled`
- `subscription.past_due`
- `transaction.completed`
- `transaction.payment_failed`

**Sécurité** : vérification HMAC via `PADDLE_WEBHOOK_SECRET`

### 11.6 Variables d'environnement

**Frontend** (`apps/web/.env.local`) :

VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx
VITE_PADDLE_VENDOR_ID=12345
VITE_PADDLE_ENV=sandbox

**Edge Functions** (`supabase/functions/.env`) :

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
PADDLE_VENDOR_ID=12345
PADDLE_API_KEY=apikey_xxxxx
PADDLE_WEBHOOK_SECRET=whsec_xxxxx
PADDLE_ENV=sandbox
PADDLE_PRICE_STANDARD_MONTHLY=pri_xxxxx
PADDLE_PRICE_STANDARD_YEARLY=pri_xxxxx
PADDLE_PRICE_PREMIUM_MONTHLY=pri_xxxxx
PADDLE_PRICE_PREMIUM_YEARLY=pri_xxxxx

**Pousser les secrets** :

npx supabase secrets set --env-file supabase/functions/.env

### 11.7 Guide complet Paddle

Le fichier `docs/paddle-setup.md` contient le guide complet (création compte, produits, webhook, tests). Se référer à ce fichier pour la mise en production.

**Passage en production** :
1. Créer un compte Paddle Production (`vendors.paddle.com`)
2. Reproduire les étapes (2-7 du guide) avec les vraies données
3. Remplacer `PADDLE_ENV=sandbox` par `PADDLE_ENV=production`
4. Remplacer les 4 Price IDs
5. Remplacer le Webhook Secret
6. Redéployer les 2 Edge Functions
7. Rebuild le frontend

---

## 12. Structure du projet

### 12.1 Arborescence globale

AniXOS/
├── .github/workflows/ci.yml
├── .vite/
├── .vscode/settings.json
├── apps/
│   └── web/
│       ├── public/               (icônes PWA + favicon)
│       ├── src/
│       │   ├── app/              (AppRouter, SubscriptionGate)
│       │   ├── assets/
│       │   ├── auth/             (StaffAuthContext, WorkerSessionContext, permissions)
│       │   ├── i18n/config.ts
│       │   ├── lib/
│       │   │   ├── activeCompany.ts
│       │   │   ├── companyContext.ts
│       │   │   ├── connectivity.ts
│       │   │   ├── credentialsSync.ts
│       │   │   ├── deviceContext.ts
│       │   │   ├── ephemeralAuthClient.ts
│       │   │   ├── localDb.ts
│       │   │   ├── paddleConfig.ts
│       │   │   ├── realtimeChannel.ts
│       │   │   ├── supabaseClient.ts
│       │   │   ├── syncEngine.ts
│       │   │   └── syncQueue.ts
│       │   ├── locales/
│       │   │   ├── ar/translation.json
│       │   │   ├── en/translation.json
│       │   │   └── fr/translation.json
│       │   ├── modules/
│       │   │   ├── accounting/
│       │   │   ├── admin/
│       │   │   ├── crm/
│       │   │   ├── developer/
│       │   │   │   ├── components/  (6 fichiers)
│       │   │   │   └── pages/DeveloperPanelPage.tsx
│       │   │   ├── engineering/
│       │   │   ├── hr/
│       │   │   ├── inventory/
│       │   │   ├── kiosk/
│       │   │   │   ├── api/kioskApi.ts
│       │   │   │   ├── components/  (17 composants)
│       │   │   │   ├── hooks/       (9 hooks)
│       │   │   │   └── pages/       (3 pages)
│       │   │   ├── manager/
│       │   │   ├── nomenclature/
│       │   │   │   ├── components/CostingModal.tsx
│       │   │   │   ├── defaults/defaultTemplate.ts
│       │   │   │   └── pages/       (5 pages)
│       │   │   ├── planning/
│       │   │   ├── procurement/
│       │   │   ├── reports/
│       │   │   │   ├── components/  (4)
│       │   │   │   ├── pages/       (6)
│       │   │   │   └── types.ts
│       │   │   ├── sales/
│       │   │   ├── settings/
│       │   │   │   ├── components/SettingsGate.tsx
│       │   │   │   ├── pages/       (5)
│       │   │   │   └── permissionModules.ts
│       │   │   ├── setup/
│       │   │   │   ├── components/  (6)
│       │   │   │   ├── pages/       (21)
│       │   │   │   └── steps/
│       │   │   └── subscription/
│       │   │       ├── components/  (2)
│       │   │       └── pages/SubscriptionPage.tsx
│       │   ├── shared/
│       │   │   ├── components/  (AppLogo, LanguageSwitcher)
│       │   │   ├── constants/   (materials, toolTypes)
│       │   │   ├── layouts/
│       │   │   ├── types/database.ts
│       │   │   └── utils/
│       │   ├── styles/
│       │   ├── types/database.ts
│       │   ├── App.tsx
│       │   ├── index.css
│       │   ├── main.tsx
│       │   └── vite-env.d.ts
│       ├── .env.local
│       ├── .env.local.example
│       ├── .gitignore
│       ├── .oxlintrc.json
│       ├── index.html
│       ├── package.json
│       ├── postcss.config.js
│       ├── README.md
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── docs/
│   ├── MASTER_DOCUMENTATION.md   (ce fichier)
│   ├── CHANGELOG-AI.md
│   ├── ERD.md
│   ├── paddle-setup.md
│   ├── PROJECT_CONTEXT.md
│   ├── RBAC_matrix.md
│   ├── SECURITY_AUDIT.md
│   ├── 00-project-context.md → 07-merge-crud-responsive.md
│   └── architecture.md (obsolète)
├── supabase/
│   ├── .temp/
│   ├── functions/           (14 Edge Functions)
│   ├── migrations/          (~55 fichiers SQL)
│   ├── config.toml
│   ├── seed.sql
│   └── supabase.zip
├── .gitignore
└── structure.txt

### 12.2 Fichiers critiques à connaître

| Fichier | Rôle |
|---|---|
| `apps/web/src/app/AppRouter.tsx` | Point d'entrée du routage (login, kiosk, admin, developer, databases-manager) |
| `apps/web/src/app/SubscriptionGate.tsx` | Contrôle d'accès basé sur le statut d'abonnement |
| `apps/web/src/modules/setup/pages/AdminHomePage.tsx` | Sidebar + routage interne + filtrage RBAC |
| `apps/web/src/lib/activeCompany.ts` | Gestion de la database active (`localStorage` + RPC `set_active_company`) |
| `apps/web/src/lib/supabaseClient.ts` | Client Supabase singleton |
| `apps/web/src/lib/connectivity.ts` | Détection online/offline |
| `apps/web/src/lib/syncQueue.ts` + `syncEngine.ts` | File de synchronisation offline (Kiosk) |
| `apps/web/src/i18n/config.ts` | Initialisation i18next (français par défaut) |
| `supabase/migrations/0016_rls_helpers.sql` | `get_my_company_id()`, `is_developer()`, etc. |
| `supabase/migrations/0059_accounts_and_databases.sql` | Architecture multi-databases |
| `supabase/migrations/0062_fix_auth_company_id.sql` | Correction sécurité `auth_user_id` |
| `supabase/migrations/0063_harden_insert_policies.sql` | Durcissement INSERT |

---


## 13. Guide de reprise

### 13.1 Si vous reprenez ce projet (développeur ou IA)

**Étape 1 — Lire dans l'ordre** :
1. `docs/MASTER_DOCUMENTATION.md` (ce fichier) — Vue complète
2. `docs/PROJECT_CONTEXT.md` — Contexte technique condensé
3. `docs/CHANGELOG-AI.md` — Dernières modifications chronologiques

**Étape 2 — Vérifier l'état du projet** :

# Compter les migrations
Get-ChildItem "supabase/migrations" -Filter *.sql | Measure-Object

# Lister les Edge Functions
Get-ChildItem "supabase/functions" -Directory

# Lister les modules frontend
Get-ChildItem "apps/web/src/modules" -Directory

**Étape 3 — Vérifier la compilation** :

cd apps/web
npx tsc --noEmit
npx vite build

**Étape 4 — Démarrer en local** :

cd apps/web
npm run dev

### 13.2 Règles d'or à ne jamais oublier

1. **Français par défaut** — toute nouvelle clé i18n commence en `fr`, puis `en` et `ar` en parallèle
2. **`auth_user_id`** pour comparer avec `auth.uid()` — jamais `staff_users.id`
3. **Ne pas modifier `get_my_company_id()`** ni les policies RLS existantes qui l'utilisent
4. **Toute nouvelle table métier** doit avoir `company_id` + RLS + policy
5. **Les 3 fichiers `translation.json` doivent rester synchronisés** (mêmes clés)
6. **Les fichiers `shared/types/database.ts` et `types/database.ts` sont en UTF-16LE** — ne pas les éditer directement, préférer des types locaux
7. **Ordre d'import JSON** doit respecter les dépendances FK
8. **Edge Functions utilisent SERVICE_ROLE_KEY** — vérifier explicitement les permissions
9. **Numérotation des migrations** — vérifier avec `Get-ChildItem` avant d'en créer une nouvelle
10. **Tester localement** (`npx tsc --noEmit`) avant tout déploiement

### 13.3 Prochaine tâche

**Mission 1** : PWA Planning pour opérateur.

Voir §5.1 pour tous les détails.

### 13.4 Contacts et ressources

**Propriétaire du projet** : Anis Chermitti (`chermitti.aniss9@gmail.com`)

**Environnement Supabase** :
- URL : `https://loqgaepskvqkhmcweszd.supabase.co`
- Dashboard : `https://app.supabase.com/project/loqgaepskvqkhmcweszd`

**Stack technique** :
- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Supabase (Postgres + Auth + Realtime + Edge Functions)
- Dexie (IndexedDB) pour offline-first
- i18next pour la traduction
- Paddle pour les paiements
- Vite PWA pour l'installation

---

## 14. Annexes

### 14.1 Fichiers `docs/` — usage

| Fichier | Statut | Usage |
|---|---|---|
| `MASTER_DOCUMENTATION.md` | ⭐ **ACTIF** | Source de vérité — à lire en premier |
| `PROJECT_CONTEXT.md` | ⚠️ Partiellement obsolète | Contexte technique — corriger si nécessaire |
| `CHANGELOG-AI.md` | ✅ Actif | Chronologie détaillée par session |
| `ERD.md` | ⚠️ Partiellement obsolète | ERD simplifié — compléter après `0059` |
| `RBAC_matrix.md` | ⚠️ Partiellement obsolète | Corrigé par §3.4 de ce document |
| `paddle-setup.md` | ✅ Actif | Guide complet Paddle |
| `SECURITY_AUDIT.md` | ✅ Actif | Audit du 2026-09-20 |
| `00-project-context.md` | ✅ Actif | Vue synthétique la plus récente |
| `01` → `07` | ✅ Archives | Sessions individuelles documentées |
| `architecture.md` | ❌ Obsolète | Ne pas consulter — remplacé par §2 |

### 14.2 Historique chronologique des sessions

**Septembre 2026 — sessions documentées** :

| Date | Session | Fichier |
|---|---|---|
| 13/09 | Tableau de bord, Rapports, Logo, Réclamations | `01-...md` |
| 14/09 | Live ops temps réel, Tables Rapports, Réclamations refonte | `02-...md` |
| 15/09 | Corrections rapides Production | `03-...md` |
| 16/09 | Nomenclature cost engine + workflow validation | `04-...md` |
| 16/09 | Ordre de fabrication | `05-...md` |
| 17/09 | Refonte Planification complète | `06-...md` |
| 17/09 | Fusion sections + CRUD + Responsive | `07-...md` |
| 17/09 | **Système d'abonnement — Phase 1** (`0059`) | `CHANGELOG-AI.md` |
| 18-20/09 | Phases 2-6 (create-account, login, Paddle, developer panel) | Sessions non documentées séparément |
| 20/09 | Multi-database Manager + Delete database | Session courante |
| 20/09 | Security Audit (7/7 tests) | `SECURITY_AUDIT.md` |
| 20/09 | Cette documentation maîtresse | Ce fichier |

### 14.3 État actuel global

**Ce qui fonctionne en production** :
- ✅ Multi-tenant complet (isolation `company_id`)
- ✅ Multi-databases (jusqu'à 5 par compte)
- ✅ Système d'abonnement (Trial + Standard + Premium + Paddle Sandbox)
- ✅ Toutes les interfaces (Admin, Kiosk, Developer Panel, Databases Manager)
- ✅ Tous les modules métier (Devis, Projets, Nomenclature, OF, Planification, Production, Rapports, Inventaire, Ventes)
- ✅ Sécurité RLS renforcée (audit 7/7)
- ✅ Responsive mobile

**Ce qui reste** :
- ⏳ PWA Planning pour opérateur (Mission 1 — priorité haute)
- ⏳ Intégration Odoo API (Mission 2 — priorité moyenne)
- ⏳ Refonte Settings (Mission 3 — priorité basse)
- ⏳ Passage Paddle Production (quand prêt)
- ⏳ Tests cross-tenant avec 2 comptes réels

### 14.4 Signature et versioning

**Version actuelle** : 2.0
**Date de cette version** : 2026-09-20
**Prochaine révision** : après la Mission 1 (PWA Planning)

Toute modification de ce document doit être **datée** et **justifiée** dans la section §14.2.

---

**FIN DU DOCUMENT**

