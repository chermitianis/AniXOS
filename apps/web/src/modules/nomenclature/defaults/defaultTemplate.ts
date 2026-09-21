// ============================================================================
// Modèle de calcul par défaut — Nomenclature
// ----------------------------------------------------------------------------
// Reproduit la structure du fichier Excel « nomenclature.xlsx » fourni par
// le client (secteur industrie mécanique). Sert de point de départ quand :
//   - une nouvelle étude est créée et qu'aucune étude existante ne peut être
//     utilisée comme modèle (cas d'une base fraîchement réinitialisée), OU
//   - l'utilisateur clique sur « Réinitialiser au modèle standard » dans
//     l'éditeur Nomenclature.
//
// IMPORTANT — compatibilité PostgREST :
//   La colonne `hourly_rate` (ajoutée par migration 0053) peut ne pas être
//   connue du cache de PostgREST malgré sa présence en base. Pour éviter les
//   erreurs 400 « column does not exist », on N'ENVOIE PAS `hourly_rate`
//   lors de l'insertion : PostgreSQL applique sa valeur par défaut (NULL).
//   L'utilisateur peut ensuite saisir le prix/h manuellement par colonne
//   (voir updateColumn dans NomenclatureEditorPage.tsx).
// ============================================================================

export type ProductionStage = "usinage_cnc" | "tournage" | "ajustage" | "stt" | "anodisation";

export interface DefaultColumnDef {
    /** Nom affiché en en-tête de colonne (modifiable par l'utilisateur). */
    name: string;
    /** Type sémantique (pilote l'édition et l'affichage). */
    column_type:
      | "text"
      | "number"
      | "date"
      | "boolean"
      | "select"
      | "formula"
      | "material"
      | "unit"
      | "currency"
      | "value"
      | "name"
      | "operation";
    /** Si vrai, la valeur brute saisie est ajoutée au total de la ligne. */
    is_total_column: boolean;
    /** Étape de production métier (mise en évidence + sous-total dédié). */
    stage?: ProductionStage;
  }
  
  // ----------------------------------------------------------------------------
  // Modèle standard : 25 colonnes reproduisant nomenclature.xlsx
  // ----------------------------------------------------------------------------
  export const DEFAULT_NOMENCLATURE_TEMPLATE: DefaultColumnDef[] = [
    // --- Identification / dimensions de la pièce ---
    { name: "Pos",                          column_type: "number",    is_total_column: false },
    { name: "Article/pièce",                column_type: "text",      is_total_column: false },
    { name: "Qte",                          column_type: "number",    is_total_column: false },
    { name: "Matière",                      column_type: "material",  is_total_column: false },
    { name: "Masse volumique",              column_type: "number",    is_total_column: false },
    { name: "Diamètre [Ø]",                 column_type: "number",    is_total_column: false },
    { name: "Long",                         column_type: "number",    is_total_column: false },
    { name: "Larg",                         column_type: "number",    is_total_column: false },
    { name: "Ep",                           column_type: "number",    is_total_column: false },
  
    // --- Matière ---
    { name: "Prix Brut/Kg",                 column_type: "currency",  is_total_column: false },
    { name: "PRIX PIECES",                  column_type: "formula",   is_total_column: true  },
    { name: "Totale Matière",               column_type: "formula",   is_total_column: true  },
  
    // --- Usinage CNC : étape PIVOT de l'application. Le nombre d'heures saisi
    // ici alimente automatiquement pieces_tasks.cnc_estimated_hours/cost, puis
    // estimated_time_minutes — donc le Kiosk, les rapports et le sélecteur de
    // pièces à l'atelier, sans aucune saisie manuelle supplémentaire ---
    { name: "Nbr H Usinage CNC",            column_type: "operation", is_total_column: false, stage: "usinage_cnc" },
    { name: "Nbr H Usinage Conventionel",   column_type: "operation", is_total_column: false },
    { name: "Nbr H Usinage Tour",           column_type: "operation", is_total_column: false, stage: "tournage" },
    { name: "Nbr H ajustement",             column_type: "operation", is_total_column: false, stage: "ajustage" },
    { name: "Totale Usinage",               column_type: "formula",   is_total_column: true  },
  
    // --- STT (traitement de surface / sous-traitance) ---
    { name: "Type STT",                     column_type: "select",    is_total_column: false },
    { name: "Prix STT",                     column_type: "currency",  is_total_column: false, stage: "stt" },
    { name: "Totale STT",                   column_type: "formula",   is_total_column: true  },
  
    // --- Anodisation (traitement de surface spécifique aluminium) ---
    { name: "Prix Anodisation",             column_type: "currency",  is_total_column: false, stage: "anodisation" },
  
    // --- Prix finaux ---
    { name: "Prix unitaire",                column_type: "formula",   is_total_column: true  },
    { name: "Prix unitaire Avec remise",    column_type: "formula",   is_total_column: true  },
    { name: "Prix Totale",                  column_type: "formula",   is_total_column: true  },
  ];
  
  /**
   * Construit les lignes à insérer dans `nomenclature_columns` pour une étude
   * donnée, à partir du modèle standard.
   *
   * ⚠️ Volontairement SANS `hourly_rate` pour éviter les erreurs 400 si le
   * cache PostgREST n'a pas encore intégré cette colonne (migration 0053).
   * PostgreSQL appliquera la valeur par défaut (NULL) côté serveur.
   */
  export function buildDefaultColumnsInserts(
    nomenclatureId: string,
    companyId: string,
  ): Array<{
    nomenclature_id: string;
    company_id: string;
    name: string;
    column_type: string;
    is_total_column: boolean;
    stage: ProductionStage | null;
    sequence_order: number;
  }> {
    return DEFAULT_NOMENCLATURE_TEMPLATE.map((col, i) => ({
      nomenclature_id: nomenclatureId,
      company_id: companyId,
      name: col.name,
      column_type: col.column_type,
      is_total_column: col.is_total_column,
      stage: col.stage ?? null,
      sequence_order: i,
    }));
  }