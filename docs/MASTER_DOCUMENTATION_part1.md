# AniXOS — Documentation Maîtresse

**Version**: 2.0
**Date**: 2026-09-20
**Statut**: ~90% prêt pour la production — reste PWA Planning, Odoo API, refonte Settings
**Propriétaire & Développeur**: Anis Chermitti (`chermitti.aniss9@gmail.com`)

> Ce document est la source de vérité unique. Il remplace tous les fichiers `docs/*.md` obsolètes et corrige leurs incohérences. Il est mis à jour à chaque tâche majeure.

---

## Table des matières

1. Vue d'ensemble
2. Architecture (3 niveaux)
3. Utilisateurs et rôles (RBAC)
4. Ce qui est fait
5. Ce qui reste (Roadmap)
6. Décisions d'architecture
7. Audit de sécurité
8. Base de données (ERD)
9. Migrations (index)
10. Edge Functions (index)
11. Système d'abonnement + Paddle
12. Structure du projet
13. Guide de reprise
14. Annexes

---

## 1. Vue d'ensemble

**AniXOS** est une plateforme **SaaS multi-tenant** destinée aux entreprises de fabrication mécanique et aux ateliers d'usinage.

### Public cible

- Entreprises industrielles mécaniques
- Ateliers de fabrication et d'usinage CNC
- Toute structure ayant des machines, des opérateurs et des projets de production

### Proposition de valeur

- Gestion complète du cycle **Devis → Projet → Étude → Ordre de fabrication → Planification → Exécution atelier → Facturation → Archive**
- **Multi-databases** : une seule adresse email peut gérer jusqu'à 5 espaces de travail totalement isolés
- **Interface kiosk** pour les opérateurs en atelier (offline-first)
- **PWA Planning** (à venir) : consultation du planning depuis le téléphone de l'opérateur
- **Intégration Odoo** (à venir) : synchronisation avec les comptes Odoo existants

### Langues

| Langue | Rôle |
|---|---|
| **Français** | Langue par défaut (fallback) — décision explicite, pas de détection automatique du navigateur |
| Anglais | Option |
| Arabe | Option (avec RTL) |

---

## 2. Architecture (3 niveaux)

L'architecture multi-tenant repose sur **3 niveaux hiérarchiques** :

┌─────────────────────────────────────────────────────────────┐
│  NIVEAU 1 : auth.users (Supabase Auth)                      │
│  - Email unique + mot de passe                              │
│  - Session JWT                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓ 1:1
┌─────────────────────────────────────────────────────────────┐
│  NIVEAU 2 : accounts                                        │
│  - Propriétaire (nom, email, téléphone, adresse)            │
│  - Statut d'abonnement (trial/active/expired/suspended)     │
│  - Plan (trial/standard/premium)                            │
│  - active_company_id (la base actuellement active)          │
│  - is_developer, max_databases, paddle_* IDs                │
└─────────────────────────────────────────────────────────────┘
                          ↓ 1:N (max 5)
┌─────────────────────────────────────────────────────────────┐
│  NIVEAU 3 : databases × companies                           │
│  Chaque database = 1 company isolée par company_id          │
│  Toutes les données métier (workers, projects, machines,    │
│  invoices, sessions, etc.) sont scopées par company_id      │
└─────────────────────────────────────────────────────────────┘

### Décisions clés

- **Isolation** : un seul mécanisme, `company_id` sur chaque table métier + RLS sur `company_id = get_my_company_id()`
- **Pas de base de données par tenant** : une seule instance Postgres, isolation logique
- **Passerelle d'entrée** : `get_my_company_id()` résout automatiquement la company active :
  1. Si `accounts.active_company_id` est défini → le renvoie (propriétaire multi-databases)
  2. Sinon, si `staff_users.auth_user_id = auth.uid()` → renvoie sa `company_id`
  3. Sinon, si `devices.auth_user_id = auth.uid()` → renvoie sa `company_id` (kiosque)

### Rôles des Edge Functions

Les Edge Functions s'exécutent avec `SERVICE_ROLE_KEY` — elles contournent RLS. Chacune doit :
1. Vérifier la session appelante via `Authorization` header
2. Vérifier les permissions explicitement
3. Effectuer l'opération demandée
4. Rollback si échec (voir `create-account`, `create-database`, `delete-database`)

---


## 3. Utilisateurs et rôles (RBAC)

### 3.1 Les 4 catégories d'utilisateurs

| Catégorie | Description | Authentification | Isolation |
|---|---|---|---|
| **Developer** | Propriétaire de la plateforme | Supabase Auth + `is_developer=true` | Aucune restriction — voit tout |
| **Owner** | Propriétaire d'un compte client | Supabase Auth | Voit uniquement ses databases |
| **Staff** | Employé d'un Owner | Supabase Auth + `staff_users` | Voit uniquement sa company |
| **Worker** | Opérateur en atelier | Username/password applicatif (pas d'Auth) | Voit uniquement via Kiosk/PWA |

### 3.2 Templates de rôles (5)

Ces rôles sont automatiquement clonés pour chaque nouvelle company (`0002_roles_permissions.sql`) :

| Code | Nom | Permissions par défaut |
|---|---|---|
| `owner` | Directeur Général / Propriétaire | `all: [view, create, edit, delete, approve]` |
| `supervisor` | Chef d'atelier | `planning: [view,create,edit]`, `shop_floor: [view,edit]`, `workers: [view]`, `machines: [view,edit]` |
| `engineering` | Ingénierie & Projets | `projects: [view,create,edit]`, `pieces_tasks: [view,create,edit]`, `task_types: [view,create,edit]` |
| `accounting` | Comptabilité & Finance | `accounting: [view,create,edit]`, `sales: [view,create,edit]`, `reports: [view]` |
| `hr` | Ressources Humaines | `workers: [view,create,edit,delete]`, `staff_users: [view,create,edit]` |

**Format des permissions** (JSONB sur `roles.permissions`) :

{ "module_name": ["view", "create", "edit", "delete", "approve"] }

La clé `"all"` donne tous les droits sur tous les modules.

### 3.3 Contraintes de sécurité au-delà du RBAC

Ces contraintes sont **au niveau base de données** — impossibles à contourner côté client :

| Contrainte | Où | Pourquoi |
|---|---|---|
| `password_hash` illisible pour tout rôle `authenticated` | `0019_workers_column_security.sql` | Empêche l'extraction des hashs de mots de passe ouvriers |
| `odoo_config` restreint à `is_owner = true` | `0017_rls_policies.sql` | Config Odoo = données sensibles |
| Enregistrement Kiosk restreint à `is_owner = true` | `register-device` | Le Kiosk obtient ensuite les hashs locaux — décision de sécurité |
| `inventory_transactions` : pas d'UPDATE/DELETE | `0023_new_tables_rls.sql` | Piste d'audit permanente |
| `activity_log` : pas d'UPDATE/DELETE | `0017_rls_policies.sql` | Journal immuable |

### 3.4 Statut du RBAC côté UI

**Actuellement** : `hasPermission()` **EST** appliqué dans `AdminHomePage.tsx` pour filtrer les éléments de la sidebar. Un utilisateur non-Owner voit uniquement les sections autorisées par son rôle.

> ⚠️ **Correction** : le fichier `RBAC_matrix.md` mentionnait que ce filtrage n'était pas encore appliqué — c'était vrai avant le 17/09/2026, **ce n'est plus le cas**.

---

## 4. Ce qui est fait

### 4.1 Système d'abonnement et multi-databases (7 phases)

| Phase | Contenu | Statut |
|---|---|---|
| 1 | Migration 0059 : tables `accounts`/`databases`/`account_events`, refonte `staff_users.id` vs `auth_user_id` | ✅ |
| 2 | Edge Function `create-account` (création atomique avec rollback) | ✅ |
| 3 | `CreateAccountPage` (9 champs + validation) | ✅ |
| 4 | `StaffLoginPage` + `DatabaseSelectorPage` + `set_active_company` RPC | ✅ |
| 5 | `SubscriptionGate` + `SubscriptionPage` + intégration Paddle (Sandbox) | ✅ |
| 6 | `/developer-panel` (5 onglets : Vue d'ensemble, Comptes, Tarification, Statistiques, Événements) | ✅ |
| 7 | **PWA Planning pour opérateur** | ❌ **À faire** |

### 4.2 Module Production complet (plan a → g)

| Point | Contenu | Migration |
|---|---|---|
| 2d | Moteur de coût Nomenclature | `0053`, `0055` |
| 2e | Workflow de validation (En attente / Validé) | `0053` |
| 2f | Ordre de fabrication : numéro auto + pièces validées | — |
| 2g | Refonte Planification (onglets machines, formulaire simplifié) | `0054` |

### 4.3 Fonctionnalités transverses

| Fonctionnalité | Statut | Migration |
|---|---|---|
| Dashboard multi-widgets | ✅ | `0049`, `0050`, `0057` |
| Live Operations (temps réel via Realtime) | ✅ | `0050`, `0057` |
| Rapports (Projets / Ouvriers / Machines / Finance) | ✅ | `0024`, `0046`, `0061` |
| Réclamations atelier + cloche admin (Portal) | ✅ | `0048`, `0051` |
| Devis → Projet → Facture → Archive | ✅ | `0007`-`0022`, `0026` |
| Nomenclature cost engine (5 étapes + CNC) | ✅ | `0029`, `0053`, `0055` |
| CNC sync automatique vers `pieces_tasks` | ✅ | `0055`, `0058` |
| Inventaire (traçabilité complète) | ✅ | `0021` |
| Export/Import JSON complet | ✅ | `DatabasePage.tsx` |
| Logos unifiés (`AppLogo`) | ✅ | — |
| Responsive mobile + drawer sidebar | ✅ | — |
| Fusion Opérations & Arrêts | ✅ | `0056` |
| CRUD complet Ouvriers / Machines | ✅ | — |
| Multi-database Manager (`/databases-manager`) | ✅ | — |
| Delete-database Edge Function | ✅ | — |

### 4.4 Migrations appliquées

**Total** : ~55 fichiers dans `supabase/migrations/` (de `0001` à `0063`, avec une zone grise `0033-0040`).

### 4.5 Edge Functions

| Function | Rôle |
|---|---|
| `accept-quote` | Accepte un devis → crée projet + ordre de fabrication |
| `create-account` | Création atomique d'un compte (9 champs) |
| `create-checkout-session` | Démarre un paiement Paddle |
| `create-database` | Crée une database supplémentaire pour un Owner |
| `delete-database` | Supprime une database (avec garde-fous) |
| `dev-delete-account` | (Developer) Supprime un compte client |
| `dev-update-account` | (Developer) Modifie un compte client |
| `generate-invoice` | Génère une facture |
| `kiosk-credentials-sync` | Synchronise les credentials locaux du Kiosk |
| `paddle-webhook` | Reçoit les webhooks Paddle (HMAC) |
| `register-device` | Enregistre un device (Kiosk ou Admin) |
| `staff-invite` | Invite un employé (Staff) |
| `tenant-provisioning` | Provisionne une company (obsolète, remplacé par `create-account`) |
| `worker-login` | Authentifie un opérateur (session logique) |

---


## 5. Ce qui reste (Roadmap)

### 5.1 Mission 1 — PWA Planning pour opérateur ⭐ PRIORITÉ

**Objectif** : permettre à l'opérateur de consulter le planning des machines **depuis son téléphone**, avant d'aller à l'atelier.

**Route cible** : `/planning`

**Caractéristiques** :
- 3 niveaux d'authentification :
  1. **QR Code** (rapide) — token unique par worker
  2. **Manuel** : email entreprise + mot de passe entreprise + nom worker + mot de passe worker
  3. **Après 1ère fois** : sauvegarde locale (auto-login)
- **Lecture seule** : affiche le planning des machines (jour / semaine)
- **N'crée AUCUNE** `work_shift` ni `work_session`
- **Identique** à ce que l'opérateur voit dans le Kiosk quand il clique sur "Planning machines"
- **PWA** : manifest.json dédié, installable, fonctionne offline (cache)

**Structure cible** :

apps/web/src/modules/worker-planning/
├── pages/
│   ├── WorkerPlanningHomePage.tsx
│   ├── WorkerPlanningLoginPage.tsx
│   └── WorkerPlanningQRScannerPage.tsx
├── components/
│   ├── PlanningDayView.tsx
│   ├── PlanningWeekView.tsx
│   ├── MachineTabs.tsx
│   └── LogoutButton.tsx
├── hooks/
│   ├── useWorkerPlanningAuth.ts
│   └── useWorkerPlanningData.ts
└── index.ts

**Migration nécessaire** : ajouter `workers.qr_token` (UUID unique, généré à la création du worker)

**Edge Function nécessaire** : `generate-worker-qr` (génère le token + retourne l'URL)

**Sécurité** :
- Lecture seule stricte
- JWT local en `localStorage` + `IndexedDB`
- Expiration après 30 jours
- Révocable par le manager

### 5.2 Mission 2 — Intégration Odoo API

**Objectif** : permettre aux entreprises qui utilisent déjà Odoo de synchroniser AniXOS avec leur compte Odoo.

**Où** : dans **Paramètres → compte Owner** (section réservée au propriétaire)

**Configuration nécessaire** :
- URL Odoo (`https://mycompany.odoo.com`)
- Base de données Odoo
- API Key ou username/password
- Choix des modules à synchroniser (clients, projets, factures, ...)

**Table déjà existante** : `odoo_config` (migration `0015`)

**RLS actuelle** : `odoo_config` accessible uniquement à `is_owner = true` — parfait pour cette mission.

**Statut** : à planifier après la PWA Planning.

### 5.3 Mission 3 — Refonte complète du module Settings

**Objectif** : réorganiser visuellement et structurellement la section **Paramètres** de l'interface admin.

**Contenu actuel** (`modules/settings/`) :
- `SettingsPage.tsx` (page principale)
- `RolesAdminPage.tsx`
- `StaffAdminPage.tsx`
- `DatabasePage.tsx` (export/import)
- `DeviceSettingsPage.tsx`

**Nouvelle structure envisagée** :
- Navigation par onglets verticaux à gauche
- Sections claires : Entreprise / Employés / Rôles / Intégrations (Odoo) / Avancé (Export/Import) / Appareils
- Section **Odoo** intégrée directement dans la page principale (au lieu d'une page à part)

**Statut** : à planifier après Odoo API.

### 5.4 Tableau récapitulatif de la Roadmap

| # | Mission | Priorité | Dépendances |
|---|---|---|---|
| 1 | PWA Planning (phase 7) | 🔴 Haute | Aucune |
| 2 | Intégration Odoo | 🟡 Moyenne | Table `odoo_config` (existante) |
| 3 | Refonte Settings | 🟢 Basse | Mission 2 |

---

## 6. Décisions d'architecture

Ces décisions sont **permanentes** — toute modification doit être validée explicitement.

### 6.1 Langue

- **Français** = langue par défaut, **sans LanguageDetector**
- Toute nouvelle clé i18n est **d'abord ajoutée en français**, puis `en` et `ar`
- Les 3 fichiers `translation.json` doivent avoir **exactement les mêmes clés** (parité stricte)

### 6.2 Isolation multi-tenant

- **Mécanisme unique** : `company_id` sur chaque table métier
- **RLS systématique** : toute nouvelle table métier doit avoir `ENABLE ROW LEVEL SECURITY` + policy `company_id = get_my_company_id()`
- **Pas d'exception** : même les tables de référence sont scopées

### 6.3 Identité

- **`staff_users.auth_user_id`** = référence à `auth.users.id` (⚠️ PAS `staff_users.id`)
- **`staff_users.id`** est un UUID indépendant (historique, pour compatibilité)
- **Un même `auth_user_id`** peut avoir plusieurs lignes `staff_users` (propriétaire multi-databases)
- **Ne jamais** utiliser `.single()` sur `staff_users` filtré uniquement par `auth_user_id`

### 6.4 Fonction centrale `get_my_company_id()`

- **Ne pas modifier** les policies RLS existantes qui l'utilisent
- Elle résout automatiquement la company active (voir §2)
- Toute nouvelle table utilise la même formule

### 6.5 Types TypeScript

- `shared/types/database.ts` et `types/database.ts` sont encodés en **UTF-16LE + BOM** (anomalie historique non corrigée volontairement)
- **Ne pas éditer directement** ces fichiers avec `str_replace`
- Pour un nouveau champ DB : utiliser `type XExt = XBase & { field: Type }` **localement** dans le composant
- Pour les inserts Supabase : utiliser `as never` si le champ n'est pas dans le type généré

### 6.6 Import/Export JSON

- **Ordre d'import** dans `DatabasePage.tsx` (`IMPORT_INSERT_ORDER`) doit respecter les dépendances FK
- Toute nouvelle table avec FK doit être insérée **après** ses parents
- Toute modification de cet ordre = vérification manuelle des dépendances

### 6.7 PostgREST schema cache

- Après une migration, un champ nouveau peut être **temporairement refusé** (cache obsolète)
- **Pattern accepté** : essayer avec le champ complet, sinon réessayer sans (`updateColumn`/`insertColumnsWithFallback`)

### 6.8 Nomenclature et CNC

- **`usinage CNC`** = étape centrale
- Les heures/coûts CNC saisis dans l'étude sont **automatiquement écrits** dans `pieces_tasks.cnc_estimated_hours/cnc_estimated_cost` ET `estimated_time_minutes`
- **Toute nouvelle fonctionnalité** qui a besoin du temps estimé d'une pièce **lit `estimated_time_minutes`** (source de vérité)

### 6.9 Archive vs Status

- **`projects.status`** : cycle de vie automatique (draft → in_progress → completed)
- **`projects.is_archived`** : action administrative manuelle, sans lien avec le cycle automatique

### 6.10 Devise

- `platform_settings.currency` = informative (affichage)
- Les vrais prix sont dans **Paddle** (PADDLE_PRICE_*)
- Si on change le prix dans `platform_settings`, **changer aussi** dans Paddle

### 6.11 Offline-first (Kiosk uniquement)

- **Dexie (IndexedDB)** : `apps/web/src/lib/localDb.ts`
- **File de synchronisation** : `syncQueue.ts` + `syncEngine.ts`
- **Fonctionne uniquement pour l'interface Kiosk** — les autres interfaces sont online-only

### 6.12 Sessions Kiosk vs Sessions Auth

- **`work_shift`** = session logique d'un opérateur (connexion → déconnexion Kiosk)
- **`work_session`** = événement de production ou downtime À L'INTÉRIEUR d'une shift
- **`activity_log`** = journal léger temps réel (peu utilisé actuellement)

---

## 7. Audit de sécurité

**Date** : 2026-09-20
**Méthodologie** : attaques anonymes via `anon_key`

### 7.1 Résultats

| # | Test | Résultat | Statut |
|---|---|---|---|
| 1 | Lecture anonyme `staff_users` | 0 rows | ✅ |
| 2 | Lecture anonyme `workers` | 0 rows | ✅ |
| 3 | Lecture anonyme `projects` | 0 rows | ✅ |
| 4 | Lecture anonyme `companies` | 0 rows | ✅ |
| 5 | Lecture anonyme `accounts` | 0 rows | ✅ |
| 6 | Insertion anonyme `workers` | 401 Unauthorized | ✅ |
| 7 | Insertion anonyme avec `company_id` falsifié | 401 Unauthorized | ✅ |

### 7.2 Points vérifiés

- ✅ `get_auth_company_id()` utilise correctement `auth_user_id`
- ✅ `get_my_company_id()` supporte le multi-database via `accounts.active_company_id`
- ✅ Aucune politique INSERT n'a `WITH CHECK = null`
- ✅ Toutes les politiques INSERT forcent `company_id = get_my_company_id()`
- ✅ `staff_users` est protégé (pas de politique `Allow read access` ouverte)
- ✅ `staff_users_insert` exige `is_my_company_owner()`

### 7.3 Conclusion

**La plateforme est prête pour la production** du point de vue de l'isolation multi-tenant.

Aucune fuite de données détectée. Toutes les politiques RLS forcent correctement `company_id = get_my_company_id()`.

### 7.4 Tests complémentaires recommandés (avant mise en production réelle)

1. **Cross-tenant read** : créer 2 comptes distincts (client A + client B), vérifier que A ne voit rien de B
2. **JWT tampering** : modifier un JWT (via jwt.io) et vérifier qu'il est rejeté
3. **Worker escalation** : se connecter en Kiosk et tenter d'accéder à des endpoints admin
4. **Storage policies** : si du Storage est utilisé, vérifier les policies sur `storage.objects`

---

**FIN DE LA PARTIE 1/2**

