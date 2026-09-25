# Roadmap — Cycle de vie produit (CRM → Livraison)

**But de ce fichier** : mémoire persistante entre sessions pour cette initiative précise (demandée explicitement par l'utilisateur). À lire en premier avant toute tâche mentionnant CRM/Étude/Chiffrage/Production/Qualité/Facturation. À mettre à jour à la fin de chaque phase (statut + fichiers touchés + décisions prises).

Vision complète (spécification originale de l'utilisateur) : voir le message contenant les 17 sections (CRM → Opportunity → Étude → Chiffrage → Quotation → Confirmed Order → Production Project → Industrial Planning → Manufacturing Orders → Workshop Execution → Quality Control → Delivery → Invoicing → Project Closure).

Règle d'or de cette initiative (rappelée par l'utilisateur) : **ne jamais dupliquer les données**. Une seule source de vérité par entité (`Customer ID`, `Opportunity ID`, `Quotation ID`, `Project ID`, `Production Order ID`, `Work Order ID`, `Quality ID`), toujours reliée à la précédente, jamais recopiée.

## Chaîne de traçabilité cible (noms de tables réels)

```
clients ──┬──> crm_prospects (opportunity) ──> quotes (+quote_items)
          │         │
          │         └──> nomenclatures (Chiffrage: piece_costing_operations + piece_costing_materials)
          │
          └──> projects (Production Project)
                    ├──> pieces_tasks (étude technique / pièces)
                    ├──> manufacturing_orders
                    ├──> planning
                    ├──> work_shifts / work_sessions (exécution atelier — déjà mature)
                    ├──> quality_inspections (à créer, Phase 7)
                    └──> invoices (+invoice_items)
```

## État des phases

| # | Phase | Statut | Détail |
|---|---|---|---|
| 1 | Liens DB (opportunity_id, prospect_id, nomenclature_id, project_id sur invoices) | ✅ Fait | `0074_lifecycle_links.sql` |
| 2 | CRM — pipeline complet + écran Opportunity | ✅ Fait | `0075_crm_opportunity_fields.sql`, `crmApi.ts`, `CRMAdminPage.tsx`, `ProspectModal.tsx` |
| 3 | Pont Gagné → Production Project (pas de ressaisie) | ✅ Fait | `createProjectFromProspect()` dans `crmApi.ts`, bouton dans `CRMAdminPage.tsx` |
| 4 | Étude de projet + Chiffrage professionnel (renommage, Valider→fermeture, import multi-fichiers, Actual Cost) | 🔶 Partiel | Cœur fonctionnel fait — polish visuel des 3 onglets pas encore fait, voir détail |
| 5 | Pont Chiffrage → Quotation → Project | ✅ Fait | `SalesAdminPage.tsx`, `accept-quote/index.ts` |
| 6 | Manufacturing Orders + Planning — renforcement des liens existants | ⬜ À faire | Déjà mature, juste à relier proprement |
| 7 | Quality Control (nouvelle table + UI) | ⬜ À faire | |
| 8 | Facturation liée au projet + clôture (Estimated vs Actual) | ⬜ À faire | |
| 9 | Dashboards par rôle + rôles Commercial/Engineering/Planner/Quality | ⬜ À faire | |

## Journal détaillé (dernière position exacte)

### Phase 1 — Liens DB (terminée)
- Migration `supabase/migrations/0074_lifecycle_links.sql` créée.
- `crm_prospects.stage` étendu (ajout non-destructif) : `qualification`, `etude`, `chiffrage`, `offre` ajoutés à côté des valeurs existantes (`nouveau`, `contacte`, `negociation`, `gagne`, `perdu` conservées, aucune donnée existante cassée).
- `projects.opportunity_id` (nullable, FK → crm_prospects) ajouté.
- `quotes.prospect_id` + `quotes.nomenclature_id` (nullable, FK) ajoutés.
- `nomenclatures.total_actual_cost` + `nomenclatures.actual_cost_updated_at` ajoutés (stockage uniquement — le calcul réel depuis work_sessions viendra en Phase 8).
- `invoices.project_id` (nullable, FK → projects) ajouté.
- Aucune table supprimée, aucune colonne supprimée, aucune contrainte existante retirée (uniquement étendue).

### Phase 2 — CRM pipeline + champs Opportunité (terminée)
- Confirmé : `CRMAdminPage.tsx` (528 lignes, Kanban + liste + panneau détail + interactions) est la version **réellement montée** dans `AdminHomePage.tsx` (`crm: CRMAdminPage`). `CrmPage.tsx` et `AccountingPage.tsx` (mes anciennes versions, Mission admin-redesign) sont du code mort, non importés nulle part — à supprimer un jour, non fait ici (prudence, hors périmètre demandé).
- `0075_crm_opportunity_fields.sql` : `crm_prospects.contact_person`, `.priority` (basse/normale/haute/urgente, défaut normale), `.requested_date`.
- `crmApi.ts` : `ProspectStage` étendu à 8 valeurs (nouveau/qualification/etude/chiffrage/offre/negociation/gagne/perdu), type `ProspectPriority` ajouté, interface `Prospect` complétée.
- `CRMAdminPage.tsx` : Kanban passé en scroll horizontal (8 colonnes), badge priorité sur les cartes, panneau détail complété (contact, priorité, date souhaitée).
- `ProspectModal.tsx` : formulaire complété avec les 3 nouveaux champs + select priorité.

### Phase 3 — Pont Gagné → Production Project (terminée, cœur fonctionnel)
- `createProjectFromProspect()` dans `crmApi.ts` : convertit le client si besoin (réutilise `convertProspectToClient`), génère un code projet (même algorithme que `ProjectsAdminPage.tsx`), crée `projects` avec `opportunity_id` renseigné — **aucune ressaisie**.
- Bouton "Créer le projet de production" visible uniquement quand `stage === "gagne"`, avec confirmation + message de succès affichant le code projet créé.
- **Non fait** (limite assumée, à faire en Phase 6 si besoin) : navigation automatique vers l'onglet Projets après création — l'utilisateur doit y aller manuellement pour l'instant, le message de succès indique juste le code à chercher.
- **Non fait** : pièces jointes (fichiers) sur les opportunités — aucune infrastructure d'upload (Supabase Storage) n'existe encore ailleurs dans le projet ; à concevoir spécifiquement si prioritaire (section 1 de la spec utilisateur, "الملفات والوثائق المرفقة").

### Phase 4 — Étude de projet + Chiffrage (partielle)
- **Découverte importante** : `modules/nomenclature/pages/NomenclatureEditorPage.tsx` (873 lignes) est du **code mort** — jamais importé/rendu nulle part (seulement cité dans un commentaire de `defaultTemplate.ts`). Non touché, non supprimé (prudence), à nettoyer un jour si confirmé inutile.
- Page réellement montée (`nav: nomenclature` dans `AdminHomePage.tsx`) : `NomenclaturePage.tsx` → 3 onglets : `NomenclatureListPage` (liste des chiffrages existants), `CostingPage` (démarrer un nouveau chiffrage en choisissant projet+pièces), `CostingArchivePage` (validés/archivés). Cliquer un chiffrage ouvre `CostingEditorPage.tsx` (calcul détaillé matières/opérations/CNC) en plein écran.
- **Renommage des onglets** (clé i18n uniquement, `etude.tabs.*`) : "Nomenclature" → **"Chiffrages"** (liste), "Chiffrage" (déjà son nom) → **"Nouveau chiffrage"** (création), pour lever l'ambiguïté entre les deux — répond à la demande explicite de l'utilisateur.
- **Bouton "Valider" corrigé** dans `CostingEditorPage.tsx` : appelait `handleSave()` (simple sauvegarde, ne changeait jamais le statut). Nouvelle fonction `handleValidate()` : fige `nomenclatures.status = 'valide'` + `validated_at`/`validated_by_staff_id` (migration `0076`), puis appelle `onBack()` — **ferme effectivement la page et retourne à la liste des Chiffrages**, comme demandé.
- **Import multi-fichiers des pièces** : ajouté dans `ProjectsAdminPage.tsx` (c'est ici, et non dans le module nomenclature, que les `pieces_tasks` sont réellement créées). Bouton "Parcourir…" à côté du champ nom de pièce → sélection multiple de fichiers natif du navigateur → extraction des noms (sans extension) → aperçu modifiable (suppression ligne par ligne) → un clic "Importer N pièce(s)" insère tout en une fois, en réutilisant phase/matière/quantité déjà saisies dans le formulaire comme valeurs par défaut partagées. Aucun fichier n'est réellement téléversé, seuls les noms sont utilisés (pas d'infrastructure Supabase Storage nécessaire).
- **Estimated vs Actual Cost** : stockage déjà préparé en Phase 1 (`nomenclatures.total_actual_cost`). **Non fait ici** : le calcul réel depuis les données d'exécution atelier (work_sessions) — prévu explicitement pour la Phase 8 (clôture de projet), car il ne peut être pertinent qu'après production réelle.

### Non fait dans cette phase (à reprendre si prioritaire)
- Polish visuel/ergonomique approfondi des 3 onglets (`NomenclatureListPage`, `CostingPage`, `CostingArchivePage`) au-delà du renommage — l'utilisateur avait demandé "très professionnel dans tous ses onglets" ; le contenu fonctionnel de ces 3 pages n'a pas été relu en détail (seulement leurs premières lignes), à faire dans une prochaine session dédiée si souhaité.
- `MaterialCard.tsx`, `OperationCard.tsx`, `CostingModal.tsx`, `costingApi.ts`, `costingConstants.ts` n'ont pas été ouverts du tout — aucune garantie qu'ils n'ont pas aussi besoin d'amélioration.

### Phase 5 — Pont Chiffrage → Quotation → Project (terminée)
- **Découverte majeure** : `accept-quote` (Edge Function) faisait déjà, et bien, ce que la spec section 6/8 demande — acceptation d'un devis → création atomique du Production Project **+ un Manufacturing Order initial**, avec rollback manuel complet en cas d'échec (pattern déjà utilisé dans `tenant-provisioning`). Rien à reconstruire ici, juste un lien manquant à ajouter.
- `accept-quote/index.ts` : propage désormais `quote.prospect_id` → `project.opportunity_id` à la création — complète la chaîne CRM → Devis → Projet sans rien casser d'existant (une ligne ajoutée).
- `SalesAdminPage.tsx` : nouveau sélecteur "Créer depuis un chiffrage validé (optionnel)" en tête du formulaire de devis. Au choix d'un chiffrage : client rempli automatiquement (depuis `projects.client_id`), une ligne de devis par pièce chiffrée (`pieces_tasks.name/quantity/cnc_estimated_cost`), et `quotes.nomenclature_id` + `quotes.prospect_id` (retrouvé via `projects.opportunity_id`) enregistrés à la création — traçabilité complète, aucune ressaisie. Reste 100% optionnel : la création manuelle classique fonctionne toujours à l'identique.

### Non fait dans cette phase
- Pas de marge/prix de vente suggéré automatique (spec section 4 : "sécurité de profit, prix de vente proposé") — le prix de chaque ligne reprend `cnc_estimated_cost` tel quel, modifiable manuellement avant envoi (le formulaire le permettait déjà). Une marge automatique nécessiterait de définir où la stocker (sur `nomenclatures` ou en paramètre d'entreprise) — à décider si prioritaire.

### Prochaine étape immédiate
Phase 6 — Manufacturing Orders + Planning : renforcer les liens déjà existants (le Manufacturing Order créé par `accept-quote` n'est encore relié à aucune `pieces_tasks` précise, juste à un `product_name` texte libre). Fichiers à lire avant modification : `ManufacturingOrdersAdminPage.tsx`, `PlanningAdminPage.tsx`, migrations `0020_manufacturing_orders.sql`, `0012_planning.sql`, `0054_planning_shift_and_mo.sql`.
