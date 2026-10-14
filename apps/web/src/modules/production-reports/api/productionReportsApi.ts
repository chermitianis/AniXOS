// ============================================================================
// productionReportsApi — Rapports de production (pièces, projets, journaliers)
// Filtré par company_id sur toutes les requêtes (C5).
//
// Règle 2026-10-14 : un shift fermé administrativement (is_force_closed) est
// cappé à la durée standard du shift (company_work_settings.classique_shift_hours
// ou fallback 8h). Tout ce qui suit la borne est ignoré — les données ne sont
// plus fiables au-delà.
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";

// ----------------------------------------------------------------------------
// Constantes de capping
// ----------------------------------------------------------------------------
const DEFAULT_SHIFT_HOURS = 8;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
export interface PieceReportHeader {
  piece_task_id: string;
  piece_name: string;
  piece_code: string | null;
  quantity: number;
  material: string | null;
  project_id: string;
  project_name: string;
  project_code: string | null;
  client_name: string | null;
  production_status: string;
  completed_at: string | null;
  estimated_seconds: number;
  actual_seconds: number;
  estimated_cost: number;
  actual_cost: number;
}

export interface PieceWpRow {
  of_work_package_id: string;
  interface_type: "cnc" | "classique";
  status: string;
  started_at: string | null;
  completed_at: string | null;
  estimated_hours: number;
  actual_seconds: number;
  sessions_count: number;
  workers_count: number;
  worker_names: string | null;
}

export interface PieceOpRow {
  operation_id: string;
  stage: string;
  label: string | null;
  estimated_hours: number;
  hourly_rate: number;
  interface_type: "cnc" | "classique";
  estimated_subtotal: number;
}

export interface ProjectCompletionHeader {
  project_id: string;
  project_code: string | null;
  project_name: string;
  client_name: string | null;
  status: string;
  completed_at: string | null;
  pieces_count: number;
  estimated_seconds: number;
  actual_seconds: number;
  labor_cost: number;
  quoted_price: number;
  margin: number;
}

export interface DailyShiftRow {
  shift_id: string;
  worker_id: string;
  worker_name: string;
  started_at: string;
  ended_at: string | null;
  /** Durée effective : cappée à shift_hours si is_force_closed. */
  duration_seconds: number;
  /** Fin effective utilisée pour le calcul (cappée ou réelle). */
  effective_ended_at: string | null;
  pieces_count: number;
  events_count: number;
  is_force_closed: boolean;
}

export interface DailyEventRow {
  session_id: string;
  session_type: string;
  task_type_name: string | null;
  stop_reason_name: string | null;
  piece_name: string | null;
  project_name: string | null;
  started_at: string;
  ended_at: string | null;
  /** Durée effective : cappée si dépasse la fenêtre du shift. */
  duration_seconds: number | null;
  note: string | null;
}

// ----------------------------------------------------------------------------
// Helper : charge les heures de shift pour une société
// ----------------------------------------------------------------------------
async function loadShiftHours(companyId: string): Promise<number> {
  const { data } = await supabase
    .from("company_work_settings")
    .select("classique_shift_hours")
    .eq("company_id", companyId)
    .maybeSingle();
  const hours = (data as { classique_shift_hours?: number } | null)?.classique_shift_hours;
  return hours && hours > 0 ? hours : DEFAULT_SHIFT_HOURS;
}

// ----------------------------------------------------------------------------
// PIÈCES TERMINÉES
// ----------------------------------------------------------------------------
export async function listCompletedPieces(
  companyId: string,
): Promise<PieceReportHeader[]> {
  const { data, error } = await supabase
    .from("pieces_tasks")
    .select(
      "id, name, code, quantity, material, project_id, completed_at, " +
        "projects(id, name, code, client_id, clients(name))",
    )
    .eq("company_id", companyId)
    .eq("production_status", "completed")
    .order("completed_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    code: string | null;
    quantity: number | null;
    material: string | null;
    project_id: string;
    completed_at: string | null;
    projects: {
      id: string;
      name: string;
      code: string | null;
      client_id: string | null;
      clients: { name?: string } | null;
    } | null;
  }>;

  const pieceIds = rows.map((r) => r.id);
  const aggregates = new Map<string, { seconds: number; cost: number }>();

  if (pieceIds.length > 0) {
    const { data: sessionsData } = await supabase
      .from("work_sessions")
      .select("piece_task_id, duration_seconds, workers(hourly_cost)")
      .eq("company_id", companyId)
      .in("piece_task_id", pieceIds)
      .is("voided_at", null)
      .eq("session_type", "production");
    for (const s of (sessionsData ?? []) as {
      piece_task_id: string | null;
      duration_seconds: number | null;
      workers: { hourly_cost?: number } | null;
    }[]) {
      if (!s.piece_task_id) continue;
      const agg = aggregates.get(s.piece_task_id) ?? { seconds: 0, cost: 0 };
      const dur = s.duration_seconds ?? 0;
      agg.seconds += dur;
      agg.cost += (dur / 3600) * (s.workers?.hourly_cost ?? 0);
      aggregates.set(s.piece_task_id, agg);
    }
  }

  const estimatedMap = new Map<string, { seconds: number; cost: number }>();
  if (pieceIds.length > 0) {
    const { data: opsData } = await supabase
      .from("piece_costing_operations")
      .select("piece_task_id, estimated_hours, subtotal")
      .eq("company_id", companyId)
      .in("piece_task_id", pieceIds);
    for (const op of (opsData ?? []) as {
      piece_task_id: string | null;
      estimated_hours: number | null;
      subtotal: number | null;
    }[]) {
      if (!op.piece_task_id) continue;
      const agg = estimatedMap.get(op.piece_task_id) ?? { seconds: 0, cost: 0 };
      agg.seconds += (op.estimated_hours ?? 0) * 3600;
      agg.cost += Number(op.subtotal ?? 0);
      estimatedMap.set(op.piece_task_id, agg);
    }
  }

  return rows.map((r) => {
    const actual = aggregates.get(r.id) ?? { seconds: 0, cost: 0 };
    const estimated = estimatedMap.get(r.id) ?? { seconds: 0, cost: 0 };
    return {
      piece_task_id: r.id,
      piece_name: r.name,
      piece_code: r.code,
      quantity: r.quantity ?? 1,
      material: r.material,
      project_id: r.project_id,
      project_name: r.projects?.name ?? "—",
      project_code: r.projects?.code ?? null,
      client_name: r.projects?.clients?.name ?? null,
      production_status: "completed",
      completed_at: r.completed_at,
      estimated_seconds: estimated.seconds,
      actual_seconds: actual.seconds,
      estimated_cost: estimated.cost,
      actual_cost: actual.cost,
    };
  });
}

export async function getPieceWorkPackages(
  companyId: string,
  pieceTaskId: string,
): Promise<PieceWpRow[]> {
  const { data: ofData } = await supabase
    .from("manufacturing_orders")
    .select("id")
    .eq("company_id", companyId)
    .eq("piece_task_id", pieceTaskId)
    .maybeSingle();
  const ofId = (ofData as { id: string } | null)?.id;
  if (!ofId) return [];

  const { data: wpData } = await supabase
    .from("of_work_packages")
    .select("id, interface_type, status, started_at, completed_at")
    .eq("company_id", companyId)
    .eq("manufacturing_order_id", ofId);
  const wps = (wpData ?? []) as Array<{
    id: string;
    interface_type: "cnc" | "classique";
    status: string;
    started_at: string | null;
    completed_at: string | null;
  }>;
  if (wps.length === 0) return [];

  const wpIds = wps.map((w) => w.id);

  const { data: sessionsData } = await supabase
    .from("work_sessions")
    .select("of_work_package_id, duration_seconds, worker_id, workers(full_name)")
    .eq("company_id", companyId)
    .in("of_work_package_id", wpIds)
    .is("voided_at", null)
    .eq("session_type", "production");

  const aggregated = new Map<
    string,
    { seconds: number; workers: Set<string>; workerNames: Set<string>; sessions: number }
  >();
  for (const s of (sessionsData ?? []) as {
    of_work_package_id: string | null;
    duration_seconds: number | null;
    worker_id: string;
    workers: { full_name?: string } | null;
  }[]) {
    if (!s.of_work_package_id) continue;
    const agg = aggregated.get(s.of_work_package_id) ?? {
      seconds: 0,
      workers: new Set<string>(),
      workerNames: new Set<string>(),
      sessions: 0,
    };
    agg.seconds += s.duration_seconds ?? 0;
    agg.workers.add(s.worker_id);
    if (s.workers?.full_name) agg.workerNames.add(s.workers.full_name);
    agg.sessions += 1;
    aggregated.set(s.of_work_package_id, agg);
  }

  const { data: ofOpsData } = await supabase
    .from("of_operations")
    .select("interface_type, estimated_hours")
    .eq("company_id", companyId)
    .eq("manufacturing_order_id", ofId);

  const estimatedByIface = new Map<string, number>();
  for (const op of (ofOpsData ?? []) as { interface_type: string; estimated_hours: number }[]) {
    estimatedByIface.set(
      op.interface_type,
      (estimatedByIface.get(op.interface_type) ?? 0) + (op.estimated_hours ?? 0),
    );
  }

  return wps.map((wp) => {
    const agg = aggregated.get(wp.id);
    return {
      of_work_package_id: wp.id,
      interface_type: wp.interface_type,
      status: wp.status,
      started_at: wp.started_at,
      completed_at: wp.completed_at,
      estimated_hours: estimatedByIface.get(wp.interface_type) ?? 0,
      actual_seconds: agg?.seconds ?? 0,
      sessions_count: agg?.sessions ?? 0,
      workers_count: agg?.workers.size ?? 0,
      worker_names: agg ? Array.from(agg.workerNames).join(", ") : null,
    };
  });
}

export async function getPieceOperations(
  companyId: string,
  pieceTaskId: string,
): Promise<PieceOpRow[]> {
  const { data } = await supabase
    .from("piece_costing_operations")
    .select("id, stage, label, estimated_hours, hourly_rate, subtotal")
    .eq("company_id", companyId)
    .eq("piece_task_id", pieceTaskId)
    .order("sequence_order");
  if (!data) return [];
  return (data as Array<{
    id: string;
    stage: string;
    label: string | null;
    estimated_hours: number;
    hourly_rate: number;
    subtotal: number | null;
  }>).map((op) => ({
    operation_id: op.id,
    stage: op.stage,
    label: op.label,
    estimated_hours: op.estimated_hours,
    hourly_rate: op.hourly_rate,
    interface_type: op.stage.toLowerCase().includes("cnc") ? "cnc" : "classique",
    estimated_subtotal: Number(op.subtotal ?? 0),
  }));
}

// ----------------------------------------------------------------------------
// PROJETS TERMINÉS
// ----------------------------------------------------------------------------
export async function listCompletedProjects(
  companyId: string,
): Promise<ProjectCompletionHeader[]> {
  const { data: projs, error } = await supabase
    .from("projects")
    .select("id, name, code, status, completed_at, quoted_price, client_id, clients(name)")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (error) throw error;

  const rows = (projs ?? []) as Array<{
    id: string;
    name: string;
    code: string | null;
    status: string;
    completed_at: string | null;
    quoted_price: number | null;
    client_id: string | null;
    clients: { name?: string } | null;
  }>;

  const result: ProjectCompletionHeader[] = [];
  for (const p of rows) {
    const { data: piecesData } = await supabase
      .from("pieces_tasks")
      .select("id, estimated_time_minutes")
      .eq("company_id", companyId)
      .eq("project_id", p.id);
    const pieces = (piecesData ?? []) as Array<{
      id: string;
      estimated_time_minutes: number | null;
    }>;
    const pieceIds = pieces.map((x) => x.id);

    let actualSeconds = 0;
    let laborCost = 0;
    if (pieceIds.length > 0) {
      const { data: sessionsData } = await supabase
        .from("work_sessions")
        .select("duration_seconds, workers(hourly_cost)")
        .eq("company_id", companyId)
        .in("piece_task_id", pieceIds)
        .is("voided_at", null)
        .eq("session_type", "production");
      for (const s of (sessionsData ?? []) as {
        duration_seconds: number | null;
        workers: { hourly_cost?: number } | null;
      }[]) {
        const dur = s.duration_seconds ?? 0;
        actualSeconds += dur;
        laborCost += (dur / 3600) * (s.workers?.hourly_cost ?? 0);
      }
    }

    const estimatedSeconds = pieces.reduce(
      (sum, x) => sum + (x.estimated_time_minutes ?? 0) * 60,
      0,
    );

    const quoted = p.quoted_price ?? 0;

    result.push({
      project_id: p.id,
      project_code: p.code,
      project_name: p.name,
      client_name: p.clients?.name ?? null,
      status: p.status,
      completed_at: p.completed_at,
      pieces_count: pieces.length,
      estimated_seconds: estimatedSeconds,
      actual_seconds: actualSeconds,
      labor_cost: laborCost,
      quoted_price: quoted,
      margin: quoted - laborCost,
    });
  }

  return result;
}

// ----------------------------------------------------------------------------
// RAPPORTS JOURNALIERS
// ----------------------------------------------------------------------------
export async function listDailyShifts(
  companyId: string,
  fromDate: string,
  toDate: string,
): Promise<DailyShiftRow[]> {
  const [shiftHours, { data, error }] = await Promise.all([
    loadShiftHours(companyId),
    supabase
      .from("work_shifts")
      .select("id, worker_id, started_at, ended_at, is_force_closed, workers(full_name)")
      .eq("company_id", companyId)
      .gte("started_at", `${fromDate}T00:00:00`)
      .lte("started_at", `${toDate}T23:59:59`)
      .order("started_at", { ascending: false }),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    worker_id: string;
    started_at: string;
    ended_at: string | null;
    is_force_closed: boolean;
    workers: { full_name?: string } | null;
  }>;

  const shiftIds = rows.map((r) => r.id);
  const piecesByShift = new Map<string, Set<string>>();
  const eventsByShift = new Map<string, number>();

  if (shiftIds.length > 0) {
    const [{ data: spwData }, { data: wsData }] = await Promise.all([
      supabase.from("shift_piece_work").select("shift_id, piece_task_id").in("shift_id", shiftIds),
      supabase.from("work_sessions").select("shift_id").in("shift_id", shiftIds).is("voided_at", null),
    ]);
    for (const r of (spwData ?? []) as { shift_id: string; piece_task_id: string }[]) {
      const set = piecesByShift.get(r.shift_id) ?? new Set();
      set.add(r.piece_task_id);
      piecesByShift.set(r.shift_id, set);
    }
    for (const r of (wsData ?? []) as { shift_id: string }[]) {
      eventsByShift.set(r.shift_id, (eventsByShift.get(r.shift_id) ?? 0) + 1);
    }
  }

  const shiftHoursMs = shiftHours * 3600 * 1000;

  return rows.map((r) => {
    const startedMs = new Date(r.started_at).getTime();

    // Si force_close : capper la fin effective à started_at + shift_hours.
    // Sinon : garder ended_at tel quel (ou null si ongoing).
    let effectiveEndedIso: string | null = r.ended_at;
    if (r.is_force_closed) {
      const capMs = startedMs + shiftHoursMs;
      const actualEndMs = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
      effectiveEndedIso = new Date(Math.min(actualEndMs, capMs)).toISOString();
    }

    const durationSeconds = effectiveEndedIso
      ? Math.round((new Date(effectiveEndedIso).getTime() - startedMs) / 1000)
      : Math.round((Date.now() - startedMs) / 1000);

    return {
      shift_id: r.id,
      worker_id: r.worker_id,
      worker_name: r.workers?.full_name ?? "—",
      started_at: r.started_at,
      ended_at: r.ended_at,
      duration_seconds: durationSeconds,
      effective_ended_at: effectiveEndedIso,
      pieces_count: piecesByShift.get(r.id)?.size ?? 0,
      events_count: eventsByShift.get(r.id) ?? 0,
      is_force_closed: r.is_force_closed,
    };
  });
}

export async function getShiftEvents(
  companyId: string,
  shiftId: string,
): Promise<DailyEventRow[]> {
  // Charge le shift + ses événements en parallèle
  const [shiftRes, { data, error }] = await Promise.all([
    supabase
      .from("work_shifts")
      .select("started_at, ended_at, is_force_closed")
      .eq("company_id", companyId)
      .eq("id", shiftId)
      .maybeSingle(),
    supabase
      .from("work_sessions")
      .select(
        "id, session_type, started_at, ended_at, duration_seconds, note, " +
          "task_types(name), stop_reasons(name), pieces_tasks(name), projects(name)",
      )
      .eq("company_id", companyId)
      .eq("shift_id", shiftId)
      .is("voided_at", null)
      .order("started_at"),
  ]);
  if (error) throw error;

  const shift = shiftRes.data as {
    started_at: string;
    ended_at: string | null;
    is_force_closed: boolean;
  } | null;

  const rows = ((data ?? []) as Array<{
    id: string;
    session_type: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    note: string | null;
    task_types: { name?: string } | null;
    stop_reasons: { name?: string } | null;
    pieces_tasks: { name?: string } | null;
    projects: { name?: string } | null;
  }>);

  // Si force_closed : on cappe la fenêtre d'affichage
  let capMs: number | null = null;
  if (shift && shift.is_force_closed) {
    const shiftHours = await loadShiftHours(companyId);
    capMs = new Date(shift.started_at).getTime() + shiftHours * 3600 * 1000;
  }

  const result: DailyEventRow[] = [];
  for (const s of rows) {
    const startedMs = new Date(s.started_at).getTime();

    // Événement démarré après la borne : on l'ignore complètement
    if (capMs !== null && startedMs >= capMs) {
      continue;
    }

    // Calcul de la durée effective (cappée si dépasse la borne)
    let effectiveDuration: number | null = s.duration_seconds;
    if (capMs !== null) {
      const actualEndMs = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
      const effectiveEndMs = Math.min(actualEndMs, capMs);
      effectiveDuration = Math.max(0, Math.round((effectiveEndMs - startedMs) / 1000));
    } else if (effectiveDuration === null && s.ended_at) {
      effectiveDuration = Math.round(
        (new Date(s.ended_at).getTime() - startedMs) / 1000,
      );
    }

    result.push({
      session_id: s.id,
      session_type: s.session_type,
      task_type_name: s.task_types?.name ?? null,
      stop_reason_name: s.stop_reasons?.name ?? null,
      piece_name: s.pieces_tasks?.name ?? null,
      project_name: s.projects?.name ?? null,
      started_at: s.started_at,
      ended_at: s.ended_at,
      duration_seconds: effectiveDuration,
      note: s.note,
    });
  }

  return result;
}
