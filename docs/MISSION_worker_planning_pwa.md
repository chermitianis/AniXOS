# Mission — PWA "Planning opérateur" (`/planning`)

**Statut** : implémentation initiale terminée (code écrit et revérifié manuellement — `npm install` puis `npm run build` n'ont **pas** été exécutés dans cet environnement, `node_modules` étant absent du zip fourni. À lancer côté utilisateur avant tout déploiement).

## 1. Objectif (rappel des instructions)

Un **quatrième point d'accès**, en plus de Admin / Kiosk / Developer : une PWA installable sur le téléphone personnel de n'importe quel opérateur, montrant le **planning des machines en lecture seule** — exactement la même donnée que le bouton "Planning machines" du Kiosk (`v_machine_planning_overview`).

Règles fondamentales posées par l'utilisateur :
- Pur outil de **communication** Entreprise → Opérateurs, **hors du périmètre des rapports/statistiques**.
- Fonctionne même **en dehors des heures de travail** et sans lien avec une session de production.
- **Un seul QR par entreprise** (pas un par opérateur) — généré dans Paramètres → onglet **Sécurité**, régénérable via un bouton "Recréer", régénération "inspirée de l'instant du clic" (date + heure + minute + seconde).
- Premier scan mémorisé sur le téléphone → plus jamais besoin de rescanner (sauf régénération du QR).
- Bouton **Actualiser** pour forcer la resynchronisation avec le serveur.

## 2. Décision d'architecture clé : pas de session Supabase Auth pour les téléphones opérateurs

Choix délibéré (à connaître avant toute évolution future de cette mission) :
- Le téléphone d'un opérateur **n'a jamais de compte `auth.users`**. Il ne connaît que `{ companyId, secret }`, extrait du QR et stocké en `localStorage` (`anixos_planning_session`).
- Chaque lecture (vérification initiale **et** chaque `fetch` du planning) revalide ce secret contre `planning_qr_codes` côté serveur (Edge Function `worker-planning-access`, `service_role`).
- Conséquence directe et volontaire : **régénérer le QR révoque instantanément tous les téléphones déjà connectés**, sans avoir à gérer une table de sessions à invalider. C'est le comportement attendu et documenté dans l'UI (bandeau d'avertissement avant confirmation de régénération).
- Alternative écartée : créer une ligne `devices` + `auth.users` par téléphone (comme le Kiosk). Rejetée car (a) prolifère les comptes `auth.users` sans bénéfice, (b) rend la révocation immédiate plus complexe, (c) le besoin exprimé est un simple accès en lecture, pas une identification individuelle.

## 3. Backend (Supabase)

### `supabase/migrations/0064_worker_planning_qr.sql`
Nouvelle table `planning_qr_codes` :
- `company_id` (PK, FK → `companies`), `qr_secret`, `generated_at`, `regenerate_count`.
- RLS : lecture/écriture réservées à `is_my_company_owner(company_id)` (fonction déjà existante, définie en `0059_accounts_and_databases.sql`) — **même pattern que `odoo_config`** (`0015`/`0017`), pour isoler un secret sensible d'une table par ailleurs largement lisible.
- **Aucune fonction RLS existante modifiée** (règle d'or respectée).

### `supabase/functions/worker-planning-access/index.ts`
Edge Function **publique** (`verify_jwt = false` dans `config.toml`, comme `worker-login`). Deux actions, body JSON `{ action, company_id, secret, date? }` :
- `"verify"` : confirme la validité du token juste après un scan, renvoie `company_name`.
- `"fetch"` : renvoie les lignes de `v_machine_planning_overview` pour la date demandée (défaut = aujourd'hui).

Les deux actions revalident systématiquement le secret + le statut d'abonnement de l'entreprise (logique dupliquée à la main de `get_company_subscription_status()`, car cette RPC dépend de `auth.uid()` — indisponible en `service_role`). Si l'abonnement n'est pas actif/trial en cours → `subscription_required`, accès bloqué (cohérence avec `SubscriptionGate` côté Admin : pas de contournement possible via cette PWA).

## 4. Frontend

### Génération/gestion du QR — `apps/web/src/modules/settings/`
- **Nouvel onglet "Sécurité"** ajouté à `SettingsPage.tsx` (`nav.security`), affichant `components/PlanningQrSecurityCard.tsx`.
- ⚠️ Placement volontairement minimal, tel que demandé ("on l'ajoutera plus tard car Paramètres sera entièrement repensé") : c'est un onglet fonctionnel simple, pas une refonte. À repositionner/enrichir lors de la Mission "refonte de Settings".
- Génération du secret **côté client**, au moment du clic (`shared/utils/planningQrToken.ts` → `generatePlanningQrSecret()`), combinant timestamp complet (année→milliseconde) + `crypto.randomUUID()`, puis `upsert` direct dans `planning_qr_codes` (protégé par RLS owner-only — pas besoin d'Edge Function ici, l'opération est un simple upsert sur sa propre ligne).
- QR affiché via `qrcode` (`QRCode.toDataURL`).

### Nouveau module `apps/web/src/modules/worker-planning/`
- `api/workerPlanningApi.ts` : appels à l'Edge Function + cache `localStorage` par `companyId:date` (secours hors-ligne si le `fetch` réseau échoue — **pas** de Dexie/`localDb`, réservé au Kiosk par décision d'architecture existante).
- `context/PlanningSessionContext.tsx` : session locale (pas de Supabase Auth).
- `pages/WorkerPlanningQRScannerPage.tsx` : scanner caméra (`jsqr`, décodage sur `<canvas>`, aucune lib tierce chargée à distance).
- `pages/WorkerPlanningHomePage.tsx` : vue planning (visuellement proche du Kiosk `PlanningOverviewModal`) + navigation par date + onglets machines + bandeau "dernière mise à jour" / "hors ligne" + bouton Actualiser + déconnexion.
- `pages/WorkerPlanningApp.tsx` : racine, bascule scanner ↔ vue planning selon la présence d'une session sauvegardée.

### Montage de la route `/planning` — `apps/web/src/App.tsx`
`window.location.pathname.startsWith("/planning")` intercepté **avant** tout le reste (StaffAuth, SubscriptionGate admin, sync Dexie) → rend directement `<WorkerPlanningApp />`. Complètement isolé du reste de l'app.

### PWA dédiée
- `public/planning-manifest.webmanifest` : manifest indépendant (nom "AniXOS Planning", `start_url`/`scope` = `/planning`, icônes réutilisées).
- `index.html` : script inline qui substitue le `<link rel="manifest">` par celui-ci quand `pathname` commence par `/planning`, **avant** `DOMContentLoaded` — pour que "Ajouter à l'écran d'accueil" propose la bonne fiche.
- Le Service Worker reste unique (scope `/`, généré par `vite-plugin-pwa`) : il met en cache `/planning` comme le reste de l'app. `vite.config.ts` → `planning-manifest.webmanifest` ajouté à `includeAssets`.

### i18n
Nouvelles clés **fr d'abord**, puis en/ar à structure identique (parité vérifiée programmatiquement) : `nav.security`, `workerPlanning.*` (16 clés), `workerPlanningSettings.*` (13 clés). Les libellés déjà existants (`kiosk.today`, `kiosk.noPlanningYet`, `setup.workerCol`, etc.) sont **réutilisés tels quels**, pas dupliqués.

## 5. ⚠️ Point à traiter par l'utilisateur avant déploiement (hors code)

**Fallback SPA côté hébergement** : `/planning` est une route gérée en JS (pas un fichier statique). Si l'hébergement actuel ne sert `index.html` que pour `/`, un rechargement direct sur `/planning` renverra une 404. Aucun `vercel.json`/`netlify.toml`/`_redirects` n'existe dans le repo — à configurer selon la plateforme d'hébergement utilisée (règle générale : toute route inconnue → `index.html`).

## 6. Remarque annexe (hors périmètre de cette mission, à votre discrétion)

En lisant `supabase/functions/worker-login/index.ts` comme référence de pattern, une **porte dérobée en dur** a été repérée : un mot de passe universel (`"1234"`/`"0000"`, à vérifier dans le fichier) contourne la vérification du mot de passe réel de n'importe quel opérateur. Non touché ici (hors instructions), mais à évaluer — cela permettrait à quiconque connaissant ce code de se connecter au Kiosk comme n'importe quel opérateur de n'importe quelle entreprise.

## 7. Fichiers créés/modifiés dans cette mission

**Créés**
- `supabase/migrations/0064_worker_planning_qr.sql`
- `supabase/functions/worker-planning-access/index.ts`
- `apps/web/src/shared/utils/planningQrToken.ts`
- `apps/web/src/modules/worker-planning/api/workerPlanningApi.ts`
- `apps/web/src/modules/worker-planning/context/PlanningSessionContext.tsx`
- `apps/web/src/modules/worker-planning/pages/WorkerPlanningQRScannerPage.tsx`
- `apps/web/src/modules/worker-planning/pages/WorkerPlanningHomePage.tsx`
- `apps/web/src/modules/worker-planning/pages/WorkerPlanningApp.tsx`
- `apps/web/src/modules/settings/components/PlanningQrSecurityCard.tsx`
- `apps/web/public/planning-manifest.webmanifest`

**Modifiés**
- `supabase/config.toml` (entrée `verify_jwt = false` pour la nouvelle fonction)
- `apps/web/package.json` (+ `qrcode`, `jsqr`, `@types/qrcode`)
- `apps/web/src/App.tsx` (branchement route `/planning`)
- `apps/web/index.html` (script de substitution du manifest)
- `apps/web/vite.config.ts` (nouveau manifest dans `includeAssets`)
- `apps/web/src/modules/settings/pages/SettingsPage.tsx` (onglet "Sécurité")
- `apps/web/src/locales/fr/translation.json`
- `apps/web/src/locales/en/translation.json`
- `apps/web/src/locales/ar/translation.json`

## 8. Prochaines étapes possibles (non demandées, à discuter)

- Étendre le bouton "Planning machines" du Kiosk pour afficher un rappel discret "cette vue est aussi disponible sur `/planning`" (optionnel, non demandé).
- Ajouter un compteur "X téléphones actifs" dans la carte Sécurité (nécessiterait de tracer les `fetch` par appareil — hors périmètre actuel, la mission exclut explicitement tout suivi/statistique).
- Intégrer cette carte QR dans le futur onglet Sécurité définitif lors de la refonte de Settings.
