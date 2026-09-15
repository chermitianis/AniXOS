# Tâche 4 — Module Nomenclature : moteur de coût + workflow de validation (2d + 2e)

Statut : ✅ terminé et vérifié (`tsc -b && vite build` + `oxlint` sans erreur
nouvelle). Construit sur le système dynamique **déjà existant**
(`nomenclatures` / `nomenclature_columns` / `nomenclature_rows` /
`nomenclature_cells`, migration 0029) plutôt que recréé de zéro.

## Ce qui existait déjà (découvert en lisant le code, pas reconstruit)

Un vrai moteur de tableau dynamique façon tableur existait déjà :
`NomenclaturePage.tsx` (routeur liste/éditeur), `NomenclatureListPage.tsx`,
`NomenclatureEditorPage.tsx`, avec colonnes typées (dont un type `operation`
déjà prévu) et un total live basé sur les colonnes marquées `is_total_column`.
Ce qui manquait : l'automatisation demandée (import des pièces, prix/heure,
recherche, "nouveautés", statut de validation).

## Migration `0053_nomenclature_costing.sql`

- `nomenclature_columns.hourly_rate` : prix/heure, utilisé uniquement quand
  `column_type = 'operation'`.
- `nomenclature_rows.piece_task_id` : relie chaque ligne à la vraie pièce du
  module Projets (index unique par étude pour éviter les doublons).
- `nomenclatures.status` (`en_attente` / `valide`) + `validated_at` +
  `validated_by`.

Aucune nouvelle policy RLS nécessaire — la protection existante par
`company_id` (0030) couvre déjà toutes les colonnes de ces tables.

## `NomenclatureEditorPage.tsx` (réécrit)

- **Import automatique des pièces** : à l'ouverture d'une étude liée à un
  projet, toute pièce du projet pas encore présente comme ligne est importée
  automatiquement (gère aussi bien "nouveau projet" que "pièce ajoutée après
  coup à un projet déjà étudié").
- **Modèle de colonnes hérité automatiquement** : si une étude s'ouvre sans
  aucune colonne (tout premier cas), elle clone les colonnes de l'étude la
  plus récente de l'entreprise — ainsi le "tableau" que le responsable des
  études configure une fois (noms d'opérations + prix/heure) se propage
  automatiquement à chaque nouveau projet, sans avoir à le reconstruire à
  chaque fois. Reste librement modifiable ensuite pour cas particuliers.
- **Calcul de coût** : pour une colonne `operation` avec un `hourly_rate`
  défini, la valeur saisie dans la cellule est traitée comme un nombre
  d'heures → coût affiché sous la cellule = heures × prix. Total par ligne =
  somme de toutes les colonnes actives (opérations tarifées + colonnes Σ
  manuelles). Total du projet = somme de tous les totaux de ligne.
- **Rappel de l'estimation CNC** : chaque ligne liée à une pièce affiche en
  petit son estimation "usinage CNC" (issue du module Projets) à titre
  indicatif seulement — non éditable ici, pour éviter toute confusion avec
  le temps total calculé par ce tableau (conformément à la remarque du client).
- **Boutons de validation** (bas de la carte total) : *En attente* (statut
  par défaut) / *Valider* (enregistre `validated_at` + `validated_by`, badge
  passe au vert). Un badge de statut est aussi visible en haut de l'éditeur.

## `NomenclatureListPage.tsx` (réécrit)

- **Recherche + filtre client** : champ de recherche (nom/code projet) +
  liste déroulante clients, résultats affichés avec badge de statut
  (Non étudié / En attente / Validé). Cliquer sur un projet ouvre son étude
  existante, ou en crée une nouvelle (import automatique géré par l'éditeur).
- **Panneau "Nouveautés"** (colonne de droite, `aside`) : projets jamais
  étudiés OU projets déjà étudiés mais ayant des pièces pas encore
  importées, triés du plus récent au plus ancien, avec badge coloré indigo.
  Cliquer dessus ouvre/complète directement l'étude. Mis à jour en temps
  réel via Supabase Realtime (`projects`, `pieces_tasks`, `nomenclatures`).
- **Historique des études** : liste de toutes les études existantes pour y
  revenir directement sans repasser par la recherche.

### Simplification assumée (à documenter pour la suite)

Le calcul des "nouveautés" se fait **côté client** (requêtes légères,
pièces limitées aux 500 plus récentes) plutôt que via une vue SQL dédiée —
suffisant pour l'échelle d'un atelier PME. Si le volume de pièces devient
très important, prévoir une vue `v_nomenclature_pending` plus tard.

## Fichiers modifiés/créés dans cette tâche

- ➕ `supabase/migrations/0053_nomenclature_costing.sql`
- ✏️ (réécrit) `apps/web/src/modules/nomenclature/pages/NomenclatureEditorPage.tsx`
- ✏️ (réécrit) `apps/web/src/modules/nomenclature/pages/NomenclatureListPage.tsx`
- ✏️ `apps/web/src/locales/fr/translation.json`, `en/translation.json`, `ar/translation.json`

⚠️ Migration `0053` à appliquer sur Supabase (`npx supabase db push`).

---

## ⏳ Reste à faire

- **2f — Ordre de fabrication** : numéro auto-incrémenté (modifiable),
  liste déroulante des pièces **validées** (`nomenclatures.status = 'valide'`,
  déjà disponible grâce à cette tâche), champ quantité resserré.
- **2g — Planification** : refonte complète (onglets machines verticaux à
  gauche, formulaire simplifié) + impact direct sur l'interface ouvrier
  (planning par date, sélecteur jour précédent/actuel/suivant, colonne
  ouvrier, onglets machines à gauche).
