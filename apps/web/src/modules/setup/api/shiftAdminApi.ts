import { supabase } from "../../../lib/supabaseClient";

// ============================================================================
// Fermeture administrative des shifts bloquées (Suivi OF). Contrairement à
// kioskApi.ts (offline-first, cache Dexie), ce module s'adresse à l'app
// Admin : toujours en ligne, aucun cache local à tenir à jour. La cascade
// (annulation des sessions/shift_piece_work encore ouvertes) est déléguée au
// trigger `trg_close_shift_cascade` (0073) — ce module ne fait que déclencher
// la fermeture elle-même, de façon strictement auditable.
//
// Ajout 2026-10-14 :
//   - `extended_at` : l'opérateur a confirmé "je continue" après 8h.
//   - `hours_open`  : durée écoulée depuis le début du shift (heures).
//   → filtrage "sessions suspectes" = extended_at IS NULL AND hours_open > 8h20.
// ============================================================================

/** Durée standard par défaut d'un shift (alignée avec company_work_settings). */
export const DEFAULT_SHIFT_HOURS = 8;

/** Marge de grâce (minutes) avant de considérer un shift comme "oublié". */
export const SHIFT_GRACE_MINUTES = 20;

export interface OpenShiftRow {
  id: string;
  company_id: string;
  worker_id: string;
  worker_name: string;
  started_at: string;
  extended_at: string | null;
  /** Durée écoulée depuis started_at, en heures (calculée côté client). */
  hours_open: number;
  open_sessions_count: number;
}

/** Un shift est "suspect" (oublié) si :
 *  - il n'est pas encore étendu (`extended_at IS NULL`) ;
 *  - il a dépassé la durée standard + marge.
 *  Note : les shifts déjà étendus ne sont jamais considérés comme suspects. */
export function isForgottenShift(shift: OpenShiftRow): boolean {
  return (
    shift.extended_at === null &&
    shift.hours_open > DEFAULT_SHIFT_HOURS + SHIFT_GRACE_MINUTES / 60
  );
}

/** Toutes les shifts actuellement ouvertes (company scoping via RLS). */
export async function fetchOpenShifts(): Promise<OpenShiftRow[]> {
  const { data, error } = await supabase
    .from("work_shifts")
    .select(
      "id, company_id, worker_id, started_at, extended_at, workers(full_name), work_sessions(id, ended_at, voided_at)",
    )
    .is("ended_at", null)
    .order("started_at", { ascending: true });

  if (error || !data) return [];

  const nowMs = Date.now();

  return (data as unknown as Array<{
    id: string;
    company_id: string;
    worker_id: string;
    started_at: string;
    extended_at: string | null;
    workers: { full_name: string } | null;
    work_sessions: { id: string; ended_at: string | null; voided_at: string | null }[] | null;
  }>).map((row) => ({
    id: row.id,
    company_id: row.company_id,
    worker_id: row.worker_id,
    worker_name: row.workers?.full_name ?? "—",
    started_at: row.started_at,
    extended_at: row.extended_at,
    hours_open: (nowMs - new Date(row.started_at).getTime()) / 3_600_000,
    open_sessions_count: (row.work_sessions ?? []).filter(
      (s) => !s.ended_at && !s.voided_at,
    ).length,
  }));
}

/** Filtre côté client : shifts ouverts + suspects (non étendus + > 8h20). */
export async function fetchForgottenShifts(): Promise<OpenShiftRow[]> {
  const all = await fetchOpenShifts();
  return all.filter(isForgottenShift);
}

/** Ferme administrativement une shift bloquée : met à jour work_shifts
 * (ended_at, is_force_closed, closed_by_staff_id, close_reason) ; le trigger
 * 0073 s'occupe d'annuler proprement toute session/shift_piece_work encore
 * ouverte, avec traçabilité complète (work_session_corrections). */
export async function forceCloseShift(
  shiftId: string,
  endedAtIso: string,
  reason: string,
  staffId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("work_shifts")
    .update({
      ended_at: endedAtIso,
      is_force_closed: true,
      closed_by_staff_id: staffId,
      close_reason: reason,
    })
    .eq("id", shiftId)
    .is("ended_at", null);

  return error ? { success: false, error: error.message } : { success: true };
}