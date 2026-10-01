// ============================================================================
// projectsStatusApi — Dérivation automatique du statut d'un projet
// à partir de l'état de ses pièces.
//
// RÈGLE MÉTIER : un projet n'a PAS de statut propre. Son statut est DÉRIVÉ
// de l'ensemble de ses pièces. Toute mutation d'une pièce (étude ou envoi
// en production) doit appeler deriveProjectStatus() pour synchroniser.
//
// Hiérarchie de priorité (du plus avancé au plus initial) :
//   1. Toutes les pièces 'completed'                        → 'completed'
//   2. Toutes les pièces 'sent' (ou plus avancé)            → 'ready_for_production'
//   3. Toutes les pièces 'valide' (avec quelques 'sent')    → 'approved'
//   4. Au moins une pièce 'en_attente' ou 'valide'          → 'studying'
//   5. Au moins une pièce 'brouillon'                       → 'draft' (reste en étude)
//   6. Sinon                                                → 'draft'
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";

type CostingStatus = "non_etudie" | "brouillon" | "en_attente" | "valide";
type ProductionStatus =
  | "not_sent" | "sent" | "in_preparation" | "ready_to_start"
  | "scheduled" | "in_progress" | "partially_done" | "completed" | "on_hold";

export type DerivedProjectStatus =
  | "draft"
  | "studying"
  | "approved"
  | "ready_for_production"
  | "completed";

interface PieceState {
  costing_status: CostingStatus | string;
  production_status: ProductionStatus | string;
}

// ---------------------------------------------------------------------------
// Règle pure (testable) — prend une liste d'états de pièces, retourne le statut
// ---------------------------------------------------------------------------
export function computeProjectStatus(pieces: PieceState[]): DerivedProjectStatus {
  if (pieces.length === 0) return "draft";

  const allCompleted = pieces.every((p) => p.production_status === "completed");
  if (allCompleted) return "completed";

  const allSentOrBeyond = pieces.every((p) =>
    [
      "sent", "in_preparation", "ready_to_start",
      "scheduled", "in_progress", "partially_done", "completed",
    ].includes(p.production_status),
  );
  if (allSentOrBeyond) return "ready_for_production";

  const allValidatedOrBeyond = pieces.every(
    (p) =>
      p.costing_status === "valide" ||
      [
        "sent", "in_preparation", "ready_to_start",
        "scheduled", "in_progress", "partially_done", "completed",
      ].includes(p.production_status),
  );
  if (allValidatedOrBeyond) return "approved";

  const anyStudied = pieces.some(
    (p) => p.costing_status === "en_attente" || p.costing_status === "valide",
  );
  if (anyStudied) return "studying";

  // Aucune pièce n'a encore été étudiée
  return "draft";
}

// ---------------------------------------------------------------------------
// Lecture + mise à jour (appelée après toute mutation d'une pièce)
// ---------------------------------------------------------------------------
export async function deriveProjectStatus(
  projectId: string,
  companyId: string,
): Promise<DerivedProjectStatus | null> {
  // 1) Lire toutes les pièces du projet
  const { data: pieces, error: pErr } = await supabase
    .from("pieces_tasks")
    .select("costing_status, production_status")
    .eq("company_id", companyId)
    .eq("project_id", projectId);

  if (pErr) throw pErr;
  const list = (pieces ?? []) as PieceState[];
  const newStatus = computeProjectStatus(list);

  // 2) Lire le statut actuel du projet
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (projErr) throw projErr;
  const currentStatus = (project as { status: string } | null)?.status ?? "";

  // 3) Ne rien faire si déjà à jour
  if (currentStatus === newStatus) return newStatus as DerivedProjectStatus;

  // 4) Mettre à jour avec les horodatages appropriés
  const patch: Record<string, unknown> = { status: newStatus };
  const nowIso = new Date().toISOString();

  if (newStatus === "studying" && currentStatus === "draft") {
    patch.study_started_at = nowIso;
  }
  if (newStatus === "approved") {
    patch.study_completed_at = nowIso;
  }
  if (newStatus === "ready_for_production") {
    patch.sent_to_production_at = nowIso;
  }
  if (newStatus === "completed") {
    patch.completed_at = nowIso;
  }

  const { error: upErr } = await supabase
    .from("projects")
    .update(patch as never)
    .eq("id", projectId)
    .eq("company_id", companyId);

  if (upErr) throw upErr;
  return newStatus as DerivedProjectStatus;
}