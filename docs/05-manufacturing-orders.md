# Tâche 5 — Module Ordre de fabrication (2f)

Statut : ✅ terminé et vérifié (`tsc -b && vite build` + `oxlint` sans erreur
nouvelle).

## 1. Numéro d'ordre auto-incrémenté (au lieu de la date du jour)

- Nouvelle fonction `computeNextOrderNumber()` : prend le plus grand numéro
  **numérique** parmi tous les ordres existants de l'entreprise et propose
  `max + 1` comme valeur par défaut à l'ouverture du formulaire et après
  chaque création réussie. Les anciens numéros au format date (non
  numériques) sont ignorés proprement dans ce calcul plutôt que de le
  casser.
- Le champ reste **modifiable manuellement** comme demandé (toujours un
  simple champ texte, juste avec une meilleure valeur par défaut).

## 2. Sélection de pièce → liste déroulante des pièces validées en Nomenclature

- Avant : liste de **tous** les noms de pièces de l'entreprise (dédupliqués
  par nom, avec une UI de désambiguïsation si le même nom existait dans
  plusieurs projets — source de confusion).
- Maintenant : la liste ne contient que les pièces appartenant à un projet
  dont l'étude Nomenclature a le statut **`valide`** (résultat direct de la
  tâche précédente), triées par date d'ajout la plus récente, limitées aux
  40 dernières. Chaque option affiche `Pièce — Projet (code)` sans ambiguïté
  possible : sélectionner une pièce fixe **à la fois** la pièce et son
  projet en un seul clic (le mécanisme de désambiguïsation manuelle n'est
  plus nécessaire et a été supprimé). Un message s'affiche si aucune pièce
  n'est encore validée nulle part.

## 3. Champ Quantité — plus compact et professionnel

- Largeur réduite (`w-14` au lieu de `w-full` sur tout le formulaire) : le
  contrôle +/− n'occupe plus qu'un petit bloc compact au lieu de s'étirer
  sur toute la largeur de la carte.
- `dir="ltr"` ajouté (un nombre se lit toujours de gauche à droite).
- Flèches natives du navigateur masquées (`appearance: textfield` +
  suppression des spin-buttons WebKit) — elles faisaient doublon disgracieux
  avec les boutons +/− personnalisés déjà présents. Les boutons +/− restent
  fonctionnels et inchangés dans leur logique (`Math.max(1, ...)`).

## Fichiers modifiés dans cette tâche

- ✏️ `apps/web/src/modules/setup/pages/ManufacturingOrdersAdminPage.tsx`
- ✏️ `apps/web/src/locales/fr/translation.json`, `en/translation.json`, `ar/translation.json`

Aucune migration SQL nécessaire pour cette tâche (repose entièrement sur
`nomenclatures.status` déjà ajouté en 0053).

---

## ⏳ Reste à faire

- **2g — Planification** (dernier point, le plus sensible car il alimente
  directement l'interface ouvrier) : onglets machines verticaux à gauche,
  formulaire simplifié (OF → ouvrier → date → poste, suppression début/fin
  de poste), et côté kiosk : sélecteur de date (hier/aujourd'hui/demain),
  onglets machines à gauche, colonne ouvrier visible.
