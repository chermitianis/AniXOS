# Tâche 7 — Fusion sections, édition/suppression Ouvriers & Machines, responsive mobile

Statut : ✅ terminé et vérifié (`tsc -b && vite build` + `oxlint` sans erreur
nouvelle).

## 0. Correctifs suite aux captures d'écran envoyées

Avant cette tâche, deux bugs réels ont été corrigés dans
`NomenclatureEditorPage.tsx` (visibles dans la console des captures) :

- `PATCH nomenclature_cells 400 Bad Request` : condition de course lors d'une
  saisie rapide (2ᵉ caractère tapé avant la fin du 1er `insert`, l'état
  local optimiste n'avait pas encore d'`id` réel → `PATCH ?id=eq.` vide).
  **Corrigé** en remplaçant la logique insert/update manuelle par un
  `upsert` direct sur la contrainte unique `(row_id, column_id)` — élimine
  la course entièrement.
- `POST nomenclature_rows 409 Conflict` : import automatique des pièces
  exécuté deux fois en parallèle (React re-render / StrictMode).
  **Corrigé** avec `upsert(..., { onConflict: "nomenclature_id,piece_task_id",
  ignoreDuplicates: true })`.
- Les erreurs `ERR_CONNECTION_TIMED_OUT` venaient d'une coupure réseau
  réelle côté navigateur, sans rapport avec le code.
- Vérifié que "Rapports sans session live d'Ahmed" n'est pas un bug de
  requête (`v_shift_report` ne filtre pas sur `ended_at`) — explication la
  plus probable : la session n'avait pas encore atteint le serveur à cause
  de la même coupure réseau.

## 1. Fusion "Opérations" + "Causes d'arrêt"

Nouveau fichier `OperationsAdminPage.tsx` (remplace `TaskTypesAdminPage.tsx`
et `StopReasonsAdminPage.tsx`, supprimés) : un seul élément de menu
("Opérations & Arrêts") avec deux onglets internes reprenant exactement les
mêmes formulaires d'ajout qu'avant (aucun changement de comportement à la
création). **Ajouté** pour chaque élément des deux listes :
- Bouton **Modifier** (édition en ligne : nom, couleur, et *requiert une
  note* pour les causes d'arrêt).
- Bouton **Supprimer**, avec confirmation et message clair si l'élément est
  déjà utilisé dans des données existantes (contrainte de clé étrangère) —
  invite à désactiver plutôt que forcer la suppression.

## 2. Ouvriers — édition et suppression

`WorkersAdminPage.tsx` : chaque ouvrier a maintenant un bouton **Modifier**
(édition en ligne : nom complet, nom d'utilisateur, mot de passe — laissé
vide = inchangé, et rôle/compétence) et **Supprimer** (avec la même
protection contre la suppression d'un ouvrier ayant un historique).

Note : la table `workers` n'a pas de colonne "rôle" à proprement parler —
le champ le plus proche sémantiquement est `skill_level` (niveau de
compétence), utilisé ici comme "Rôle / Compétence".

## 3. Machines — suppression ajoutée (l'édition existait déjà)

En lisant le code, `MachinesAdminPage.tsx` avait déjà une édition complète
(nom, code, type, nombre d'outils magasin) — cliquer sur une machine charge
ses données dans le formulaire. **Ajouté** : bouton Supprimer, même
protection FK que les autres sections.

Confirmé que le nombre d'outils magasin pilote bien le nombre de lignes du
tableau d'outils côté ouvrier : à la création, N lignes sont générées ; en
cas d'augmentation, seules les lignes manquantes sont ajoutées (aucune ligne
existante n'est jamais supprimée automatiquement, pour ne pas perdre les
affectations d'outils déjà faites par un ouvrier depuis le kiosk — un choix
de sécurité des données assumé, documenté dans le code).

## 4. Interface responsive (mobile / PWA)

Problème principal trouvé : la sidebar admin était **fixe à 256px, toujours
visible**, sans aucun mode mobile — sur un téléphone (~375px de large), il
ne restait quasiment aucune place pour le contenu.

- `AdminHomePage.tsx` : nouvelle barre supérieure mobile (bouton menu ☰ +
  logo + cloche) visible uniquement en dessous de `md`, sidebar transformée
  en **tiroir coulissant** (overlay + fond assombri, fermeture au clic sur
  un lien ou en dehors) sur mobile, redevient une sidebar statique normale
  à partir de `md`. Marges de contenu réduites sur petit écran.
- `PlanningAdminPage.tsx` et `PlanningOverviewModal.tsx` (kiosk) : les
  onglets machines (auparavant une colonne fixe de 208px) deviennent un
  **bandeau horizontal défilable** sur mobile, et reprennent leur forme de
  colonne verticale à partir de `sm`/`md`.
- `PlanningOverviewModal.tsx` : la fenêtre passe en plein écran sur mobile
  (`h-[95vh] w-full`) au lieu d'une largeur fixe à 85vw qui pouvait être
  trop étroite sur petit écran.

Le `viewport` meta (déjà correct dans `index.html`) et les correctifs
d'alignement de tableaux des tâches précédentes s'appliquent aussi bien en
mobile. Cette passe couvre les points de rupture les plus critiques
(navigation générale + les pages les plus denses construites récemment) ;
d'autres ajustements fins resteront à faire au cas par cas si des pages
spécifiques posent encore problème à l'usage réel sur téléphone.

## Fichiers modifiés/créés/supprimés

- ➕ `apps/web/src/modules/setup/pages/OperationsAdminPage.tsx`
- ➖ `apps/web/src/modules/setup/pages/TaskTypesAdminPage.tsx`
- ➖ `apps/web/src/modules/setup/pages/StopReasonsAdminPage.tsx`
- ✏️ `apps/web/src/modules/setup/pages/AdminHomePage.tsx`
- ✏️ `apps/web/src/modules/setup/pages/WorkersAdminPage.tsx`
- ✏️ `apps/web/src/modules/setup/pages/MachinesAdminPage.tsx`
- ✏️ `apps/web/src/modules/setup/pages/PlanningAdminPage.tsx`
- ✏️ `apps/web/src/modules/kiosk/components/PlanningOverviewModal.tsx`
- ✏️ `apps/web/src/modules/nomenclature/pages/NomenclatureEditorPage.tsx` (correctifs §0)
- ✏️ `apps/web/src/locales/fr/translation.json`, `en/translation.json`, `ar/translation.json`

Aucune migration SQL requise pour cette tâche.
