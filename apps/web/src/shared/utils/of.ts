// ============================================================================
// of — utilitaires pour les ordres de fabrication (OF)
//
// RÈGLE : ce fichier ne fait AUCUN appel réseau. Il contient uniquement
// des fonctions pures (calculs, formatage, dérivation). Les appels Supabase
// vivent dans modules/production/api/.
// ============================================================================

import { supabase } from "../../lib/supabaseClient";
import type { InterfaceType } from "../types/database";

// ---------------------------------------------------------------------------
// Type de base
// ---------------------------------------------------------------------------
export type OfInterface = "cnc" | "classique";

// ---------------------------------------------------------------------------
// 1. Dérivation interface à partir du stage de costing
//
//    Le stage est stocké dans piece_costing_operations.stage (voir STAGES
//    dans costingConstants). La règle : tout stage dont le nom contient
//    "cnc" est de type cnc, le reste est classique.
// ---------------------------------------------------------------------------
export function stageToInterface(stage: string | null | undefined): OfInterface {
  if (!stage) return "classique";
  return stage.toLowerCase().includes("cnc") ? "cnc" : "classique";
}

// ---------------------------------------------------------------------------
// 2. Filtrage des machines compatibles avec une interface donnée
// ---------------------------------------------------------------------------
export function machineMatchesInterface(
  machineInterface: InterfaceType | string | null | undefined,
  required: OfInterface,
): boolean {
  if (!machineInterface) return false;
  if (machineInterface === "both") return true;
  return machineInterface === required;
}

//-------------------------------------------------------------------------
// 3. Génération du numéro d'OF
//    Format : OF-YYMMCCNN-NN (aligné avec le code projet)
//    La fonction SQL utilise p_project_id pour déduire le code client.
// ---------------------------------------------------------------------------
export async function generateOfNumber(
    companyId: string,
    projectId?: string | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc("generate_of_number", {
      p_company_id: companyId,
      p_project_id: projectId ?? null,
    });
    if (error || !data) {
      throw new Error(error?.message ?? "Impossible de générer le numéro d'OF.");
    }
    return data as string;
  }

// ---------------------------------------------------------------------------
// 4. Dérivation : regrouper les opérations par interface
//
//    Prend une liste d'opérations (avec leur stage) et retourne un objet
//    { cnc: [...], classique: [...] }. Utile pour créer les work packages.
// ---------------------------------------------------------------------------
export interface OperationLike {
  stage: string;
  estimated_hours?: number;
}

export function groupOperationsByInterface<T extends OperationLike>(
  operations: T[],
): { cnc: T[]; classique: T[] } {
  const cnc: T[] = [];
  const classique: T[] = [];
  for (const op of operations) {
    if (stageToInterface(op.stage) === "cnc") cnc.push(op);
    else classique.push(op);
  }
  return { cnc, classique };
}

// ---------------------------------------------------------------------------
// 5. Calcul du statut OF à partir de ses work packages
//
//    Règle :
//      - aucune WP commencée     → "ready"        (prêt à planifier)
//      - au moins une WP démarrée mais pas toutes finies → "in_progress"
//      - toutes les WP finies    → "completed"
// ---------------------------------------------------------------------------
export interface WorkPackageLike {
  status: "pending" | "in_progress" | "completed";
}

export type DerivedOfStatus = "ready" | "in_progress" | "completed";

export function deriveOfStatus(packages: WorkPackageLike[]): DerivedOfStatus {
  if (packages.length === 0) return "ready";

  const allDone = packages.every((p) => p.status === "completed");
  if (allDone) return "completed";

  const anyStarted = packages.some(
    (p) => p.status === "in_progress" || p.status === "completed",
  );
  if (anyStarted) return "in_progress";

  return "ready";
}

// ---------------------------------------------------------------------------
// 6. Dérivation : statut de production de la pièce (pieces_tasks)
//    à partir de l'état de son OF
// ---------------------------------------------------------------------------
export type DerivedPieceStatus =
  | "sent"
  | "in_preparation"
  | "ready_to_start"
  | "scheduled"
  | "in_progress"
  | "partially_done"
  | "completed";

export function derivePieceStatus(
  ofStatus: string,
  packages: WorkPackageLike[],
): DerivedPieceStatus {
  if (ofStatus === "completed") return "completed";
  if (ofStatus === "scheduled") return "scheduled";
  if (ofStatus === "ready") return "ready_to_start";
  if (ofStatus === "draft" || ofStatus === "preparing") return "in_preparation";
  if (ofStatus === "in_progress") {
    const allDone = packages.length > 0 && packages.every((p) => p.status === "completed");
    if (allDone) return "completed";
    const anyDone = packages.some((p) => p.status === "completed");
    if (anyDone) return "partially_done";
    return "in_progress";
  }
  return "in_preparation";
}

// ---------------------------------------------------------------------------
// 7. Formatage pour l'affichage
// ---------------------------------------------------------------------------
export function formatHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}