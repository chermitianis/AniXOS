# Tâche 6 — Refonte complète du module Planification (2g)

Statut : ✅ terminé et vérifié (`tsc -b && vite build` + `oxlint` sans erreur
nouvelle). Tâche la plus sensible du plan (alimente directement l'interface
ouvrier) — traitée en dernier et avec le plus de vérifications croisées.

## Correction préalable indispensable (découverte en creusant le schéma)

`pieces_tasks.manufacturing_order_id` existait déjà dans le schéma (0020)
mais **n'était jamais renseigné** par le formulaire de création d'un ordre
de fabrication. Sans ce lien, Planification n'aurait eu aucun moyen fiable
de retrouver automatiquement la pièce à partir d'un numéro d'OF. Corrigé
dans `ManufacturingOrdersAdminPage.tsx` : à la création d'un OF, la pièce
choisie est maintenant mise à jour avec `manufacturing_order_id` = l'OF créé.

## Migration `0054_planning_shift_and_mo.sql`

- `planning.manufacturing_order_id` (FK vers `manufacturing_orders`).
- `planning.shift_number` (`poste_1` / `poste_2` / `poste_3`).
- `shift_start` / `shift_end` rendus **nullable** (conservés en base pour
  compatibilité et usage futur éventuel, mais plus jamais remplis par le
  nouveau formulaire).
- `v_machine_planning_overview` : ajout de `worker_id`/`worker_name` et
  `shift_number` **en fin de liste de colonnes** (leçon retenue de l'incident
  sur la migration 0050 : `CREATE OR REPLACE VIEW` interdit tout
  changement d'ordre des colonnes existantes).

## `PlanningAdminPage.tsx` (réécrit)

- **Onglets machines verticaux à gauche** (`aside` avant le contenu dans le
  DOM = à gauche en français/anglais LTR).
- Formulaire simplifié dans l'ordre exact demandé :
  1. **Ordre de fabrication** — liste déroulante des 20 derniers OF créés,
     du plus récent au plus ancien (`Numéro — Pièce (Projet)`).
  2. **Ouvrier** — liste déroulante des ouvriers actifs.
  3. **Date**.
  4. **Poste** — `Poste 1 / 2 / 3` (le réglage fin des horaires par poste se
     fera plus tard dans le module Ouvriers, comme demandé).
- Champs **Début de poste / Fin de poste supprimés** du formulaire.
- À la soumission : `project_id` et `piece_task_id` sont **déduits
  automatiquement** de l'OF sélectionné (`project_id` directement sur l'OF,
  `piece_task_id` retrouvé via `pieces_tasks.manufacturing_order_id`) — aucune
  saisie manuelle de projet/pièce n'est plus nécessaire ici.
- La liste des affectations à droite se filtre désormais sur la machine
  actuellement sélectionnée dans l'onglet.

## Côté interface ouvrier

### `kioskApi.ts` — `fetchMachinePlanningOverview(date?)`

Accepte maintenant un paramètre `date` (défaut : aujourd'hui) et filtre la
vue sur ce jour précis, au lieu de renvoyer tout l'historique sans filtre.
`MachinePlanningRow` inclut désormais `worker_id` / `worker_name` /
`shift_number`.

### `PlanningOverviewModal.tsx` (réécrit)

- **Navigation par date** dans l'en-tête : flèches précédent/suivant +
  sélecteur de date natif, avec libellé intelligent ("Aujourd'hui" / "Hier"
  / "Demain" / date complète sinon). Fonctionne pour n'importe quelle date
  future planifiée par l'administration, pas seulement J-1/J/J+1.
- **Onglets machines déplacés à gauche** (au lieu de droite).
- **Colonne Ouvrier ajoutée** en premier dans le tableau, mise en évidence
  (couleur distincte) pour une lecture rapide "qui fait quoi sur cette
  machine aujourd'hui".
- Tableau restylé avec la même convention professionnelle que les Rapports
  (en-têtes alignés selon le type de colonne, cf. tâche 2).

### `useWorkerPlanning.ts`

Tri de la file d'attente personnelle de l'ouvrier basé sur `shift_number`
au lieu de `shift_start` (qui n'est plus renseigné par le nouveau
formulaire) — évite un tri silencieusement cassé.

## Fichiers modifiés/créés dans cette tâche

- ➕ `supabase/migrations/0054_planning_shift_and_mo.sql`
- ✏️ `apps/web/src/modules/setup/pages/ManufacturingOrdersAdminPage.tsx` (lien pièce↔OF ajouté)
- ✏️ (réécrit) `apps/web/src/modules/setup/pages/PlanningAdminPage.tsx`
- ✏️ (réécrit) `apps/web/src/modules/kiosk/components/PlanningOverviewModal.tsx`
- ✏️ `apps/web/src/modules/kiosk/api/kioskApi.ts`
- ✏️ `apps/web/src/locales/fr/translation.json`, `en/translation.json`, `ar/translation.json`

⚠️ Migration `0054` à appliquer sur Supabase (`npx supabase db push`).

---

## ✅ Plan complet du module Production (a → g) : terminé

Avec cette tâche, l'ensemble du plan de refonte demandé pour les 4 sections
Production (Projets, Nomenclature, Ordre de fabrication, Planification) est
complet et vérifié sans erreur de build à chaque étape.
