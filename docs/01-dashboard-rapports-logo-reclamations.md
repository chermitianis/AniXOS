# Tâche 1 — Tableau de bord, Rapports, Logo unifié, Réclamations

Date: session du 13/09/2026 — statut: ✅ terminé, build + tsc + oxlint vérifiés sans erreur.

## 1. Tableau de bord — sessions actives uniquement

**Bug trouvé** : `v_live_operations` remontait aussi les sessions `downtime`
(pause/arrêt), donc le widget "Live Operations" du Tableau de bord affichait
des ouvriers en pause comme s'ils travaillaient activement sur une machine.

**Correction** :
- `supabase/migrations/0049_live_operations_production_only.sql` (nouveau) :
  la vue filtre désormais `session_type = 'production'` en plus de
  `ended_at is null and voided_at is null`.
- `apps/web/src/modules/setup/pages/ManagerDashboardPage.tsx` : le point de
  statut est maintenant toujours bleu + animation `animate-ping` (pulse "live")
  puisque seules les sessions production remontent désormais.

⚠️ **À exécuter côté Supabase** : la migration SQL doit être appliquée
(`supabase db push` ou équivalent) — elle n'est pas appliquée automatiquement
par ce chantier front-end.

## 2. Rapports — vérification + corrections

Constat général : l'architecture `work_shifts` (connexion→déconnexion) /
`work_sessions` (événement production ou arrêt) / `activity_log` (journal
léger) était déjà correcte et complète. Points vérifiés :

- Connexion ouvrier → `startWorkerShift` (auth/WorkerSessionContext.tsx).
  Déconnexion → `endWorkerShift` : ferme toutes les sessions ouvertes puis
  la shift → déclenche en temps réel le rafraîchissement de l'onglet
  "Par employé" des Rapports (déjà câblé via Realtime sur `work_shifts`).
- Onglet **Par employé** (`WorkerReportTab.tsx`) : déjà complet — résumé de
  shift, journal d'événements détaillé (4 colonnes), tableau des pièces
  travaillées, résumé par type d'événement. **Aucune modification requise.**
- Onglet **Par machine** (`MachineReportTab.tsx`) : **bug corrigé** — le
  formatage de date utilisait `"ar-SA"` en dur au lieu de la langue active
  de l'interface (`i18n.language`). Corrigé.
- Onglet **Par projet** (`ProjectsReportTab.tsx`) : **ajout demandé** — barre
  de recherche unifiée (projets par nom/code en local, pièces par nom via
  requête `pieces_tasks` avec debounce 300ms). Un résultat de pièce ouvre
  directement le rapport complet du projet parent (`ProjectReportModal`,
  déjà détaillé : ventilation des pièces + détail des sessions).

Nouvelles clés i18n ajoutées (fr/en/ar) : `setup.searchProjectsPiecesPlaceholder`,
`setup.searchResultsPieces`, `setup.noSearchResults`.

## 3. Logo unifié AniXOS

Avant : badge texte "AX" codé en dur à 3 endroits différents (Admin sidebar,
TopNavBar kiosk, WorkerLoginPage), incohérent avec l'icône PWA réelle.

**Solution** : nouveau composant partagé
`apps/web/src/shared/components/AppLogo.tsx` qui affiche l'icône PWA réelle
(`public/icon-96.png` pour les tailles sm/md, `public/icon-192.png` pour la
taille lg) — dérivée de la même source que `icon-512.png` utilisée pour le
build PWA dans `dist/`. Remplacé dans :
- `modules/setup/pages/AdminHomePage.tsx` (sidebar admin)
- `modules/kiosk/components/TopNavBar.tsx` (barre du kiosk)
- `modules/kiosk/pages/WorkerLoginPage.tsx` (écran de connexion, taille `lg`)

## 4. Réclamations des ouvriers → visibilité admin

**Constat** : la table `workshop_reclamations` (migration 0048) et l'envoi
côté kiosk (`ReclamationModal.tsx` → `createReclamation()`) existaient déjà
et fonctionnaient, mais **aucune interface admin ne les affichait** — la
donnée arrivait en base sans jamais être vue.

**Solution** : nouveau composant
`apps/web/src/modules/setup/components/ReclamationsBell.tsx` — cloche de
notification placée dans l'en-tête de la sidebar admin (visible depuis
n'importe quelle section, pas seulement le Tableau de bord, car une
réclamation peut nécessiter une réaction immédiate). Fonctionnalités :
- Badge rouge = nombre de réclamations `nouveau`.
- Liste déroulante (réclamations `nouveau` + `en_cours`), temps réel via
  Supabase Realtime (déjà activé sur cette table en 0048).
- Actions rapides : "Prendre en charge" (`en_cours`) / "Résolu" (`resolu`,
  enregistre `resolved_by_staff_id` + `resolved_at`).

Nouvelles clés i18n ajoutées (fr/en/ar) : `setup.reclamationsBellTitle`,
`setup.reclamationsEmpty`, `setup.reclamationStatusNew`,
`setup.reclamationStatusInProgress`, `setup.markInProgress`,
`setup.markResolved`.

## Fichiers modifiés/créés dans cette tâche

- ➕ `supabase/migrations/0049_live_operations_production_only.sql`
- ✏️ `apps/web/src/modules/setup/pages/ManagerDashboardPage.tsx`
- ✏️ `apps/web/src/modules/reports/pages/MachineReportTab.tsx`
- ✏️ `apps/web/src/modules/reports/pages/ProjectsReportTab.tsx`
- ➕ `apps/web/src/shared/components/AppLogo.tsx`
- ➕ `apps/web/src/modules/setup/components/ReclamationsBell.tsx`
- ✏️ `apps/web/src/modules/setup/pages/AdminHomePage.tsx`
- ✏️ `apps/web/src/modules/kiosk/components/TopNavBar.tsx`
- ✏️ `apps/web/src/modules/kiosk/pages/WorkerLoginPage.tsx`
- ✏️ `apps/web/src/locales/fr/translation.json`
- ✏️ `apps/web/src/locales/en/translation.json`
- ✏️ `apps/web/src/locales/ar/translation.json`

## Notes techniques utiles pour la suite

- `apps/web/src/shared/types/database.ts` et `apps/web/src/types/database.ts`
  sont encodés en **UTF-16LE** (fichiers d'origine) — `oxlint` ne peut pas les
  lire (erreur pré-existante, sans rapport avec ce chantier). Éviter de les
  éditer directement avec `str_replace` sans revérifier l'encodage ; préférer
  définir des interfaces locales dans les composants (pattern déjà utilisé
  partout dans le repo, ex. `ShiftReportRow` dans `WorkerReportTab.tsx`).
- `npm install` a été exécuté dans `apps/web` pour valider `tsc -b` + `oxlint`
  + `vite build` — tout est ✅ sans erreur (juste un warning taille de chunk,
  pré-existant, sans rapport avec ce chantier).
- Architecture confirmée : `work_shifts` = connexion→déconnexion, `work_sessions` =
  événement (production ou downtime) à l'intérieur d'une shift,
  `activity_log` = journal léger temps réel (peu utilisé actuellement, alimenté
  seulement par `shift_end`, `piece_completed`, `piece_paused`).
