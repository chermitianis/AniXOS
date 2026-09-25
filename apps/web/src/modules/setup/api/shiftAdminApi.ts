import { supabase } from "../../../lib/supabaseClient";

// ============================================================================
// Fermeture administrative des shifts bloquées (Dashboard). Contrairement à
// kioskApi.ts (offline-first, cache Dexie), ce module s'adresse à l'app
// Admin : toujours en ligne, aucun cache local à tenir à jour. La cascade
// (annulation des sessions/shift_piece_work encore ouvertes) est déléguée au
// trigger `trg_close_shift_cascade` (0073) — ce module ne fait que déclencher
// la fermeture elle-même, de façon strictement auditable.
// ============================================================================

export interface OpenShiftRow {
  id: string;
  company_id: string;
  worker_id: string;
  worker_name: string;
  started_at: string;
  open_sessions_count: number;
}

/** Toutes les shifts actuellement ouvertes (company scoping via RLS). Utilisé
 * pour le widget "Sessions bloquées" du Dashboard — indépendant de
 * v_live_operations, qui ne montre que les sessions de type "production" et
 * peut donc rater une shift ouverte sans aucun événement actif. */
export async function fetchOpenShifts(): Promise<OpenShiftRow[]> {
  const { data, error } = await supabase
    .from("work_shifts")
    .select("id, company_id, worker_id, started_at, workers(full_name), work_sessions(id, ended_at, voided_at)")
    .is("ended_at", null)
    .order("started_at", { ascending: true });

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    company_id: string;
    worker_id: string;
    started_at: string;
    workers: { full_name: string } | null;
    work_sessions: { id: string; ended_at: string | null; voided_at: string | null }[] | null;
  }>).map((row) => ({
    id: row.id,
    company_id: row.company_id,
    worker_id: row.worker_id,
    worker_name: row.workers?.full_name ?? "—",
    started_at: row.started_at,
    open_sessions_count: (row.work_sessions ?? []).filter((s) => !s.ended_at && !s.voided_at).length,
  }));
}

/** Ferme administrativement une shift bloquée : met à jour work_shifts
 * (ended_at, is_force_closed, closed_by_staff_id, close_reason) ; le trigger
 * 0073 s'occupe d'annuler proprement toute session/shift_piece_work encore
 * ouverte, avec traçabilité complète (work_session_corrections). */
export async function forceCloseShift(
  shiftId: string,
  endedAtIso: string,
  reason: string,
  staffId: string
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
    .is("ended_at", null); // garde-fou : ne ferme que si toujours ouverte (évite une double fermeture en cas de course)

  return error ? { success: false, error: error.message } : { success: true };
}
