// ============================================================================
// kioskApi: طبقة وصول موحدة لبيانات الكشك (أونلاين أولاً، كاش أوفلاين تلقائياً)
// كل دالة هنا: تحاول أونلاين → تُحدِّث الكاش المحلي عند النجاح → أو تقرأ من
// الكاش مباشرة عند الانقطاع.
//
// إضافات 2026-10-02 :
//   - Correction: planning.status utilise 'done' (contrainte DB).
//   - fetchConsumedSecondsForPiece: temps consommé pour calcul du temps restant.
//   - fetchWorkerPlanningQueue: tri par sequence_order.
//   - fetchAllProjectsForWorker / searchPiecesInCompany / createEmergencyPieceTask.
//   - fetchDayPlanningForKiosk: vue planning complète (jour) pour le Kiosk.
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";
import { localDb } from "../../../lib/localDb";
import { connectivityMonitor } from "../../../lib/connectivity";
import { enqueueSync } from "../../../lib/syncQueue";
import { resolveCompanyId } from "../../../lib/companyContext";
import { getStageInterface } from "../../nomenclature/lib/costingConstants";
import type {
  TaskType,
  StopReason,
  PlanningEntry,
  WorkSession,
  WorkShift,
  ShiftPieceWork,
  Machine,
  Project,
  PieceTask,
  SessionType,
  PieceHandoff,
  CorrectedByType,
  WorkshopReclamation,
} from "../../../shared/types/database";

export const MAX_ACTIVE_EVENTS_PER_WORKER = 3;

export class MaxActiveEventsError extends Error {
  constructor() {
    super("MAX_ACTIVE_EVENTS_REACHED");
    this.name = "MaxActiveEventsError";
  }
}

// ------------------------------------------------------------------
// أنواع المهام / أسباب التوقف
// ------------------------------------------------------------------
export async function fetchTaskTypes(): Promise<TaskType[]> {
  const companyId = await resolveCompanyId();
  if (connectivityMonitor.getStatus() && companyId) {
    const { data, error } = await supabase
      .from("task_types")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order");
    if (!error && data) {
      const rows = data as TaskType[];
      await localDb.taskTypes.bulkPut(rows);
      return rows;
    }
  }
  return companyId
    ? localDb.taskTypes.where("company_id").equals(companyId).sortBy("sort_order")
    : [];
}

export async function fetchStopReasons(): Promise<StopReason[]> {
  const companyId = await resolveCompanyId();
  if (connectivityMonitor.getStatus() && companyId) {
    const { data, error } = await supabase
      .from("stop_reasons")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order");
    if (!error && data) {
      const rows = data as StopReason[];
      await localDb.stopReasons.bulkPut(rows);
      return rows;
    }
  }
  return companyId
    ? localDb.stopReasons.where("company_id").equals(companyId).sortBy("sort_order")
    : [];
}

// ------------------------------------------------------------------
// مهام المخطط
// ------------------------------------------------------------------
export async function fetchWorkerPlanningQueue(workerId: string): Promise<PlanningEntry[]> {
  const companyId = await resolveCompanyId();
  const today = new Date().toISOString().slice(0, 10);

  if (connectivityMonitor.getStatus() && companyId) {
    const { data, error } = await supabase
      .from("planning")
      .select("*")
      .eq("company_id", companyId)
      .eq("worker_id", workerId)
      .lte("planned_date", today)
      .in("status", ["scheduled", "in_progress"])
      .order("planned_date", { ascending: false })
      .order("shift_number")
      .order("sequence_order", { ascending: true });

    if (!error && data) {
      const rows = data as PlanningEntry[];
      await localDb.planning.bulkPut(rows);
      return rows;
    }
  }

  return localDb.planning
    .where("worker_id")
    .equals(workerId)
    .filter((p) => p.planned_date <= today && (p.status === "scheduled" || p.status === "in_progress"))
    .toArray()
    .then((rows) =>
      rows.sort((a, b) => {
        const dateOrder = b.planned_date.localeCompare(a.planned_date);
        if (dateOrder !== 0) return dateOrder;
        const shiftOrder = String(a.shift_number ?? "").localeCompare(String(b.shift_number ?? ""));
        if (shiftOrder !== 0) return shiftOrder;
        return (a.sequence_order ?? 1) - (b.sequence_order ?? 1);
      }),
    );
}

export async function fetchTodayPlanningForWorker(workerId: string): Promise<PlanningEntry | null> {
  const queue = await fetchWorkerPlanningQueue(workerId);
  return queue[0] ?? null;
}

export async function fetchPlanningById(id: string): Promise<PlanningEntry | null> {
  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase.from("planning").select("*").eq("id", id).maybeSingle();
    if (!error) {
      const row = data as PlanningEntry | null;
      if (row) await localDb.planning.put(row);
      return row;
    }
  }
  return (await localDb.planning.get(id)) ?? null;
}

export async function fetchMachineById(id: string): Promise<Machine | null> {
  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase.from("machines").select("*").eq("id", id).maybeSingle();
    if (!error) {
      const row = data as Machine | null;
      if (row) await localDb.machines.put(row);
      return row;
    }
  }
  return (await localDb.machines.get(id)) ?? null;
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (!error) {
      const row = data as Project | null;
      if (row) await localDb.projects.put(row);
      return row;
    }
  }
  return (await localDb.projects.get(id)) ?? null;
}

export async function fetchPieceTaskById(id: string): Promise<PieceTask | null> {
  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase.from("pieces_tasks").select("*").eq("id", id).maybeSingle();
    if (!error) {
      const row = data as PieceTask | null;
      if (row) await localDb.piecesTasks.put(row);
      return row;
    }
  }
  return (await localDb.piecesTasks.get(id)) ?? null;
}

export async function fetchPiecesForProject(projectId: string): Promise<PieceTask[]> {
  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase
      .from("pieces_tasks")
      .select("*")
      .eq("project_id", projectId)
      .neq("status", "cancelled")
      .order("sequence_order");
    if (!error && data) {
      const rows = data as PieceTask[];
      await localDb.piecesTasks.bulkPut(rows);
      return rows;
    }
  }
  return localDb.piecesTasks.where("project_id").equals(projectId).sortBy("sequence_order");
}

export async function fetchActiveMachinesList(): Promise<Machine[]> {
  const companyId = await resolveCompanyId();
  if (connectivityMonitor.getStatus() && companyId) {
    const { data, error } = await supabase
      .from("machines")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name");
    if (!error && data) {
      const rows = data as Machine[];
      await localDb.machines.bulkPut(rows);
      return rows;
    }
  }
  return companyId ? localDb.machines.where("company_id").equals(companyId).sortBy("name") : [];
}

// ============================================================================
// WorkShift (حصة العامل)
// ============================================================================
export class WorkerAlreadyConnectedError extends Error {
  constructor() {
    super("WORKER_ALREADY_CONNECTED");
    this.name = "WorkerAlreadyConnectedError";
  }
}

export async function startWorkerShift(workerId: string, deviceId: string | null): Promise<WorkShift> {
  const companyId = await resolveCompanyId();
  if (!companyId) throw new Error("تعذر تحديد شركة الجهاز الحالي");

  const localExisting = await localDb.workShifts
    .where("worker_id")
    .equals(workerId)
    .filter((shift) => shift.ended_at === null)
    .first();
  if (localExisting) throw new WorkerAlreadyConnectedError();

  if (connectivityMonitor.getStatus()) {
    const { data: existing, error: existingError } = await supabase
      .from("work_shifts")
      .select("*")
      .eq("worker_id", workerId)
      .is("ended_at", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) throw new WorkerAlreadyConnectedError();
  }

  const now = new Date().toISOString();
  const shift: WorkShift = {
    id: crypto.randomUUID(),
    company_id: companyId,
    worker_id: workerId,
    device_id: deviceId,
    started_at: now,
    ended_at: null,
    source: connectivityMonitor.getStatus() ? "online" : "offline_sync",
    created_at: now,
  };

  await localDb.workShifts.put(shift);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("work_shifts").insert(shift as never);
    if (!error) return shift;
    if (error.code === "23505") {
      const { data: winner } = await supabase
        .from("work_shifts")
        .select("*")
        .eq("worker_id", workerId)
        .is("ended_at", null)
        .maybeSingle();
      if (winner) {
        await localDb.workShifts.delete(shift.id);
        throw new WorkerAlreadyConnectedError();
      }
    }
  }
  await enqueueSync("work_shifts", "insert", shift as unknown as Record<string, unknown>);
  return shift;
}

export async function endWorkerShift(shiftId: string, workerId: string): Promise<void> {
  await closeAllOpenSessionsForWorker(workerId);
  const now = new Date().toISOString();
  await closeAllOpenShiftPieceWorkForShift(shiftId, now);

  const cached = await localDb.workShifts.get(shiftId);
  const closedShift: WorkShift = cached
    ? { ...cached, ended_at: now }
    : {
        id: shiftId,
        company_id: (await resolveCompanyId()) ?? "",
        worker_id: workerId,
        device_id: null,
        started_at: now,
        ended_at: now,
        source: "online",
        created_at: now,
      };

  await localDb.workShifts.put(closedShift);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("work_shifts").update({ ended_at: now }).eq("id", shiftId);
    if (!error) {
      await logActivity(workerId, null, null, "shift_end", "Fin de session — déconnexion");
      return;
    }
  }
  await enqueueSync("work_shifts", "update", closedShift as unknown as Record<string, unknown>);
  await logActivity(workerId, null, null, "shift_end", "Fin de session — déconnexion (hors ligne)");
}

export async function fetchOpenShiftForWorker(workerId: string): Promise<WorkShift | null> {
  if (!connectivityMonitor.getStatus()) return null;
  const { data } = await supabase
    .from("work_shifts")
    .select("*")
    .eq("worker_id", workerId)
    .is("ended_at", null)
    .maybeSingle();
  return (data as WorkShift | null) ?? null;
}

export async function hydrateWorkerStateFromServer(workerId: string, shift: WorkShift): Promise<void> {
  await localDb.workShifts.put(shift);

  const { data: sessions } = await supabase
    .from("work_sessions")
    .select("*")
    .eq("worker_id", workerId)
    .is("ended_at", null)
    .is("voided_at", null);
  for (const s of (sessions as WorkSession[] | null) ?? []) {
    await localDb.workSessions.put(s);
  }

  const { data: pieceWork } = await supabase
    .from("shift_piece_work")
    .select("*")
    .eq("shift_id", shift.id)
    .is("ended_at", null);
  for (const row of (pieceWork as ShiftPieceWork[] | null) ?? []) {
    await localDb.shiftPieceWork.put(row);
  }
}

export async function fetchOpenSessionsForWorker(workerId: string): Promise<WorkSession[]> {
  return localDb.workSessions
    .where("worker_id")
    .equals(workerId)
    .filter((s) => s.ended_at === null && !s.voided_at)
    .toArray();
}

// ============================================================================
// shift_piece_work
// ============================================================================
export async function openShiftPieceWork(
  shiftId: string | null,
  workerId: string,
  pieceTaskId: string,
  projectId: string | null,
): Promise<void> {
  if (!shiftId) return;

  const existingOpen = await localDb.shiftPieceWork
    .where("[shift_id+piece_task_id]")
    .equals([shiftId, pieceTaskId])
    .filter((row) => row.ended_at === null)
    .first();
  if (existingOpen) return;

  const companyId = await resolveCompanyId();
  if (!companyId) return;

  if (connectivityMonitor.getStatus()) {
    const { data: remoteExisting } = await supabase
      .from("shift_piece_work")
      .select("*")
      .eq("shift_id", shiftId)
      .eq("piece_task_id", pieceTaskId)
      .is("ended_at", null)
      .maybeSingle();
    if (remoteExisting) {
      await localDb.shiftPieceWork.put(remoteExisting as ShiftPieceWork);
      return;
    }
  }

  const row: ShiftPieceWork = {
    id: crypto.randomUUID(),
    company_id: companyId,
    shift_id: shiftId,
    worker_id: workerId,
    piece_task_id: pieceTaskId,
    project_id: projectId,
    started_at: new Date().toISOString(),
    ended_at: null,
    created_at: new Date().toISOString(),
  };

  await localDb.shiftPieceWork.put(row);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("shift_piece_work").insert(row as never);
    if (!error) return;
    if (error.code === "23505") {
      const { data: winner } = await supabase
        .from("shift_piece_work")
        .select("*")
        .eq("shift_id", shiftId)
        .eq("piece_task_id", pieceTaskId)
        .is("ended_at", null)
        .maybeSingle();
      await localDb.shiftPieceWork.delete(row.id);
      if (winner) await localDb.shiftPieceWork.put(winner as ShiftPieceWork);
      return;
    }
  }
  await enqueueSync("shift_piece_work", "insert", row as unknown as Record<string, unknown>);
}

export async function closeShiftPieceWork(
  shiftId: string | null,
  pieceTaskId: string,
  endedAt?: string,
): Promise<void> {
  if (!shiftId) return;

  const openRow = await localDb.shiftPieceWork
    .where("[shift_id+piece_task_id]")
    .equals([shiftId, pieceTaskId])
    .filter((row) => row.ended_at === null)
    .first();
  if (!openRow) return;

  const closedRow: ShiftPieceWork = { ...openRow, ended_at: endedAt ?? new Date().toISOString() };
  await localDb.shiftPieceWork.put(closedRow);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase
      .from("shift_piece_work")
      .update({ ended_at: closedRow.ended_at })
      .eq("id", openRow.id);
    if (!error) return;
  }
  await enqueueSync("shift_piece_work", "update", closedRow as unknown as Record<string, unknown>);
}

export async function closeAllOpenShiftPieceWorkForShift(shiftId: string, endedAt: string): Promise<void> {
  const openRows = await localDb.shiftPieceWork
    .where("shift_id")
    .equals(shiftId)
    .filter((row) => row.ended_at === null)
    .toArray();

  for (const row of openRows) {
    const closedRow: ShiftPieceWork = { ...row, ended_at: endedAt };
    await localDb.shiftPieceWork.put(closedRow);
    if (connectivityMonitor.getStatus()) {
      const { error } = await supabase
        .from("shift_piece_work")
        .update({ ended_at: endedAt })
        .eq("id", row.id);
      if (!error) continue;
    }
    await enqueueSync("shift_piece_work", "update", closedRow as unknown as Record<string, unknown>);
  }
}

export async function switchShiftPiece(
  shiftId: string | null,
  workerId: string,
  previousPieceTaskId: string | null,
  newPieceTaskId: string,
  newProjectId: string | null,
): Promise<void> {
  if (previousPieceTaskId && previousPieceTaskId !== newPieceTaskId) {
    await closeOpenSessionsForWorkerPiece(workerId, previousPieceTaskId);
    await closeShiftPieceWork(shiftId, previousPieceTaskId);
    await resetPiecePhase(previousPieceTaskId);
  }
  await openShiftPieceWork(shiftId, workerId, newPieceTaskId, newProjectId);
}

// ============================================================================
// WorkSession (الأحداث)
// ============================================================================

interface ToggleEventInput {
  workerId: string;
  shiftId: string | null;
  machineId: string | null;
  projectId: string | null;
  pieceTaskId: string | null;
  planningId: string | null;
  ofWorkPackageId: string | null;
  sessionType: SessionType;
  taskTypeId: string | null;
  stopReasonId: string | null;
  note?: string;
}

function isSameButton(session: WorkSession, input: ToggleEventInput): boolean {
  if (session.session_type !== input.sessionType) return false;
  if (input.sessionType === "production") {
    return session.task_type_id === input.taskTypeId && session.piece_task_id === input.pieceTaskId;
  }
  return session.stop_reason_id === input.stopReasonId && session.piece_task_id === input.pieceTaskId;
}

export async function toggleWorkerEvent(input: ToggleEventInput): Promise<WorkSession> {
  const openSessions = await fetchOpenSessionsForWorker(input.workerId);
  const existing = openSessions.find((s) => isSameButton(s, input));

  if (existing) {
    return closeSession(existing);
  }

  if (openSessions.length >= MAX_ACTIVE_EVENTS_PER_WORKER) {
    throw new MaxActiveEventsError();
  }

  return startSession(input);
}

async function startSession(input: ToggleEventInput): Promise<WorkSession> {
  const companyId = await resolveCompanyId();
  if (!companyId) throw new Error("تعذر تحديد شركة الجهاز الحالي");

  const now = new Date().toISOString();
  const newSession: WorkSession = {
    id: crypto.randomUUID(),
    company_id: companyId,
    worker_id: input.workerId,
    shift_id: input.shiftId,
    machine_id: input.machineId,
    project_id: input.projectId,
    piece_task_id: input.pieceTaskId,
    planning_id: input.planningId,
    of_work_package_id: input.ofWorkPackageId,
    session_type: input.sessionType,
    task_type_id: input.taskTypeId,
    stop_reason_id: input.stopReasonId,
    note: input.note ?? null,
    started_at: now,
    ended_at: null,
    duration_seconds: null,
    source: connectivityMonitor.getStatus() ? "online" : "offline_sync",
    created_at: now,
    voided_at: null,
    voided_by_staff_id: null,
    void_reason: null,
  };

  await localDb.workSessions.put(newSession);
  await persistSessionChange(newSession, "insert");

  if (input.sessionType === "production" && input.pieceTaskId) {
    await updatePieceTaskStatusIfPending(input.pieceTaskId);
  }

  return newSession;
}

async function closeSession(session: WorkSession): Promise<WorkSession> {
  const now = new Date().toISOString();
  const closedSession: WorkSession = {
    ...session,
    ended_at: now,
    duration_seconds: Math.round((new Date(now).getTime() - new Date(session.started_at).getTime()) / 1000),
  };
  await localDb.workSessions.put(closedSession);
  await persistSessionChange(closedSession, "update");
  return closedSession;
}

export async function closeOpenSessionsForWorkerPiece(workerId: string, pieceTaskId: string): Promise<void> {
  const open = await fetchOpenSessionsForWorker(workerId);
  for (const s of open.filter((s) => s.piece_task_id === pieceTaskId)) {
    await closeSession(s);
  }
}

export async function closeAllOpenSessionsForWorker(workerId: string): Promise<void> {
  const open = await fetchOpenSessionsForWorker(workerId);
  for (const s of open) {
    await closeSession(s);
  }
}

async function updatePieceTaskStatusIfPending(pieceTaskId: string): Promise<void> {
  if (connectivityMonitor.getStatus()) {
    await supabase
      .from("pieces_tasks")
      .update({ status: "in_progress" })
      .eq("id", pieceTaskId)
      .eq("status", "pending");
  }
  const cached = await localDb.piecesTasks.get(pieceTaskId);
  if (cached && cached.status === "pending") {
    await localDb.piecesTasks.put({ ...cached, status: "in_progress" });
  }
}

async function persistSessionChange(session: WorkSession, operation: "insert" | "update"): Promise<void> {
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("work_sessions").upsert(session as never);
    if (!error) return;
  }
  await enqueueSync("work_sessions", operation, session as unknown as Record<string, unknown>);
}

async function logActivity(
  workerId: string,
  workSessionId: string | null,
  machineId: string | null,
  eventType: string,
  eventLabel: string,
): Promise<void> {
  const companyId = await resolveCompanyId();
  const entry = {
    id: crypto.randomUUID(),
    company_id: companyId,
    worker_id: workerId,
    work_session_id: workSessionId,
    machine_id: machineId,
    event_type: eventType,
    event_label: eventLabel,
    metadata: {},
    event_time: new Date().toISOString(),
  };

  await localDb.activityLog.put(entry as never);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("activity_log").insert(entry as never);
    if (!error) return;
  }
  await enqueueSync("activity_log", "insert", entry);
}

// ============================================================================
// Terminer / À continuer
// ============================================================================

export async function markPieceTaskComplete(
  pieceTaskId: string,
  workerId: string,
  shiftId: string | null,
  ofWorkPackageId: string | null,
): Promise<void> {
  const cachedPiece = await localDb.piecesTasks.get(pieceTaskId);
  if (cachedPiece?.status === "completed") return;

  await closeOpenSessionsForWorkerPiece(workerId, pieceTaskId);
  await closeShiftPieceWork(shiftId, pieceTaskId);

  if (!connectivityMonitor.getStatus()) {
    if (cachedPiece) {
      await localDb.piecesTasks.put({ ...cachedPiece, status: "completed", production_status: "completed" });
      await enqueueSync("pieces_tasks", "update", {
        ...cachedPiece,
        status: "completed",
        production_status: "completed",
      } as unknown as Record<string, unknown>);
    }
    await logActivity(workerId, null, null, "piece_completed", "Pièce terminée ✓ (hors ligne)");
    return;
  }

  const nowIso = new Date().toISOString();

  if (ofWorkPackageId) {
    await supabase
      .from("of_work_packages")
      .update({
        status: "completed",
        completed_at: nowIso,
        completed_by_worker_id: workerId,
      })
      .eq("id", ofWorkPackageId);
  }

  let allWpDone = false;
  let ofId: string | null = null;
  if (ofWorkPackageId) {
    const { data: wpRow } = await supabase
      .from("of_work_packages")
      .select("manufacturing_order_id")
      .eq("id", ofWorkPackageId)
      .maybeSingle();
    ofId = (wpRow as { manufacturing_order_id: string | null } | null)?.manufacturing_order_id ?? null;

    if (ofId) {
      const { data: siblings } = await supabase
        .from("of_work_packages")
        .select("status")
        .eq("manufacturing_order_id", ofId);
      const all = (siblings ?? []) as { status: string }[];
      allWpDone = all.length > 0 && all.every((w) => w.status === "completed");

      if (allWpDone) {
        await supabase
          .from("manufacturing_orders")
          .update({ status: "completed", completed_at: nowIso })
          .eq("id", ofId);
      } else {
        await supabase
          .from("manufacturing_orders")
          .update({ status: "in_progress" })
          .eq("id", ofId);
      }
    }
  }

  await supabase
    .from("pieces_tasks")
    .update({
      status: allWpDone ? "completed" : "in_progress",
      production_status: allWpDone ? "completed" : "partially_done",
      completed_at: allWpDone ? nowIso : null,
    })
    .eq("id", pieceTaskId);

  await localDb.piecesTasks.update(pieceTaskId, {
    status: allWpDone ? "completed" : "in_progress",
    production_status: allWpDone ? "completed" : "partially_done",
    completed_at: allWpDone ? nowIso : null,
  });

  await supabase
    .from("planning")
    .update({ status: "done" })
    .eq("piece_task_id", pieceTaskId)
    .eq("worker_id", workerId)
    .eq("company_id", (await resolveCompanyId()) ?? "")
    .in("status", ["scheduled", "in_progress"]);

  await logActivity(
    workerId,
    null,
    null,
    allWpDone ? "piece_completed" : "package_completed",
    allWpDone ? "Pièce terminée ✓" : "Paquet terminé — en attente des autres paquets",
  );
}

export async function pauseWorkOnPiece(pieceTaskId: string, workerId: string): Promise<void> {
  await closeOpenSessionsForWorkerPiece(workerId, pieceTaskId);
  await updatePieceTaskStatusIfPending(pieceTaskId);
  await logActivity(workerId, null, null, "piece_paused", "Mise en pause — travail toujours en cours");
}

export async function updatePiecePhase(pieceTaskId: string, phase: number): Promise<void> {
  const value = String(Math.max(1, Math.floor(phase)));
  const cached = await localDb.piecesTasks.get(pieceTaskId);
  if (cached) await localDb.piecesTasks.put({ ...cached, phase: value });
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("pieces_tasks").update({ phase: value }).eq("id", pieceTaskId);
    if (!error) return;
  }
  if (cached)
    await enqueueSync("pieces_tasks", "update", { ...cached, phase: value } as unknown as Record<string, unknown>);
}

export async function resetPiecePhase(pieceTaskId: string): Promise<void> {
  const cached = await localDb.piecesTasks.get(pieceTaskId);
  if (cached) await localDb.piecesTasks.put({ ...cached, phase: "1" });
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("pieces_tasks").update({ phase: "1" }).eq("id", pieceTaskId);
    if (!error) return;
  }
  if (cached) {
    await enqueueSync("pieces_tasks", "update", { ...cached, phase: "1" } as unknown as Record<string, unknown>);
  }
}

// ============================================================================
// Corrections / audit
// ============================================================================
export interface CorrectionContext {
  reason: string;
  correctedByType: CorrectedByType;
  correctedByStaffId?: string | null;
  correctedByWorkerId?: string | null;
}

export async function correctWorkSession(
  session: WorkSession,
  durationSeconds: number,
  context: CorrectionContext,
): Promise<void> {
  const newEndedAt = new Date(new Date(session.started_at).getTime() + durationSeconds * 1000).toISOString();
  const corrected: WorkSession = { ...session, ended_at: newEndedAt, duration_seconds: durationSeconds };

  await recordCorrection(session, corrected, "edit", context);
  await localDb.workSessions.put(corrected);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("work_sessions").upsert(corrected as never);
    if (!error) return;
  }
  await enqueueSync("work_sessions", "update", corrected as unknown as Record<string, unknown>);
}

export async function voidWorkSession(session: WorkSession, context: CorrectionContext): Promise<void> {
  const now = new Date().toISOString();
  const voided: WorkSession = {
    ...session,
    voided_at: now,
    voided_by_staff_id: context.correctedByStaffId ?? null,
    void_reason: context.reason,
  };
  await recordCorrection(session, voided, "void", context);
  await localDb.workSessions.put(voided);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("work_sessions").upsert(voided as never);
    if (!error) return;
  }
  await enqueueSync("work_sessions", "update", voided as unknown as Record<string, unknown>);
}

async function recordCorrection(
  before: WorkSession,
  after: WorkSession,
  action: "edit" | "void",
  context: CorrectionContext,
): Promise<void> {
  const companyId = await resolveCompanyId();
  const record = {
    id: crypto.randomUUID(),
    company_id: companyId,
    work_session_id: before.id,
    action,
    corrected_by_type: context.correctedByType,
    corrected_by_staff_id: context.correctedByStaffId ?? null,
    corrected_by_worker_id: context.correctedByWorkerId ?? null,
    reason: context.reason,
    old_started_at: before.started_at,
    old_ended_at: before.ended_at,
    old_duration_seconds: before.duration_seconds,
    new_started_at: after.started_at,
    new_ended_at: after.ended_at,
    new_duration_seconds: after.duration_seconds,
    created_at: new Date().toISOString(),
  };
  await localDb.workSessionCorrections.put(record as never);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("work_session_corrections").insert(record as never);
    if (!error) return;
  }
  await enqueueSync("work_session_corrections", "insert", record);
}

export async function fetchWorkSessionCorrections(workSessionId: string) {
  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase
      .from("work_session_corrections")
      .select("*")
      .eq("work_session_id", workSessionId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      await localDb.workSessionCorrections.bulkPut(data as never);
      return data;
    }
  }
  return localDb.workSessionCorrections
    .where("work_session_id")
    .equals(workSessionId)
    .reverse()
    .sortBy("created_at");
}

export async function fetchWorkerActivityToday(workerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  return localDb.activityLog
    .where("worker_id")
    .equals(workerId)
    .filter((e) => e.event_time.startsWith(today))
    .reverse()
    .sortBy("event_time");
}

export async function fetchWorkerSessionsToday(workerId: string): Promise<WorkSession[]> {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await localDb.workSessions.where("worker_id").equals(workerId).toArray();
  return sessions.filter((s) => s.started_at.startsWith(today));
}

// ============================================================================
// Piece handoffs / reclamations
// ============================================================================
export async function createPieceHandoff(
  pieceTaskId: string,
  projectId: string | null,
  shiftId: string | null,
  workerId: string,
  message: string,
  toWorkerId: string | null = null,
): Promise<PieceHandoff> {
  const companyId = await resolveCompanyId();
  if (!companyId) throw new Error("تعذر تحديد شركة الجهاز الحالي");
  const handoff: PieceHandoff = {
    id: crypto.randomUUID(),
    company_id: companyId,
    project_id: projectId,
    piece_task_id: pieceTaskId,
    shift_id: shiftId,
    from_worker_id: workerId,
    to_worker_id: toWorkerId,
    message: message.trim(),
    is_read: false,
    created_at: new Date().toISOString(),
    read_at: null,
  };
  await localDb.pieceHandoffs.put(handoff);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("piece_handoffs").insert(handoff as never);
    if (!error) return handoff;
  }
  await enqueueSync("piece_handoffs", "insert", handoff as unknown as Record<string, unknown>);
  return handoff;
}

export async function fetchPieceHandoffs(pieceTaskId: string): Promise<PieceHandoff[]> {
  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase
      .from("piece_handoffs")
      .select("*")
      .eq("piece_task_id", pieceTaskId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      const rows = data as PieceHandoff[];
      await localDb.pieceHandoffs.bulkPut(rows);
      return rows;
    }
  }
  return localDb.pieceHandoffs.where("piece_task_id").equals(pieceTaskId).reverse().sortBy("created_at");
}

export async function markPieceHandoffRead(handoff: PieceHandoff): Promise<void> {
  const patch = { is_read: true, read_at: new Date().toISOString() };
  await localDb.pieceHandoffs.update(handoff.id, patch);
  if (connectivityMonitor.getStatus()) {
    await supabase.from("piece_handoffs").update(patch).eq("id", handoff.id);
  }
}

export async function createReclamation(
  workerId: string,
  machineId: string | null,
  message: string,
): Promise<WorkshopReclamation> {
  const companyId = await resolveCompanyId();
  if (!companyId) throw new Error("تعذر تحديد شركة الجهاز الحالي");

  const reclamation: WorkshopReclamation = {
    id: crypto.randomUUID(),
    company_id: companyId,
    worker_id: workerId,
    machine_id: machineId,
    message: message.trim(),
    status: "nouveau",
    resolved_by_staff_id: null,
    resolved_at: null,
    resolution_note: null,
    created_at: new Date().toISOString(),
  };

  await localDb.workshopReclamations.put(reclamation);
  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("workshop_reclamations").insert(reclamation as never);
    if (!error) return reclamation;
  }
  await enqueueSync("workshop_reclamations", "insert", reclamation as unknown as Record<string, unknown>);
  return reclamation;
}

// ============================================================================
// Planning overview + opérations estimées
// ============================================================================
export interface MachinePlanningRow {
  planning_id: string;
  machine_id: string;
  machine_name: string;
  project_id: string | null;
  project_name: string | null;
  piece_task_id: string | null;
  piece_ref: string | null;
  quantity: number | null;
  material: string | null;
  client_name: string | null;
  planned_date: string;
  status: string;
  worker_id: string;
  worker_name: string;
  shift_number: string | null;
  manufacturing_order_id: string | null;
  order_number: string | null;
  product_name: string | null;
  estimated_time_minutes: number | null;
  drawing_url: string | null;
  notes: string | null;
}

export async function fetchMachinePlanningOverview(date?: string): Promise<MachinePlanningRow[]> {
  if (!connectivityMonitor.getStatus()) return [];
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("v_machine_planning_overview")
    .select("*")
    .eq("planned_date", targetDate)
    .order("machine_name");
  if (error || !data) return [];
  return data as MachinePlanningRow[];
}

export interface PieceOperationEstimate {
  id: string;
  stage: string;
  label: string | null;
  estimated_hours: number;
  hourly_rate: number;
  subtotal: number;
  sequence_order: number;
  machine_id: string | null;
}

export async function fetchPieceOperationsWithEstimate(
  pieceTaskId: string,
): Promise<PieceOperationEstimate[]> {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase
      .from("piece_costing_operations")
      .select("id, stage, label, estimated_hours, hourly_rate, subtotal, sequence_order, machine_id")
      .eq("company_id", companyId)
      .eq("piece_task_id", pieceTaskId)
      .order("sequence_order");
    if (!error && data) {
      return data as PieceOperationEstimate[];
    }
  }

  return [];
}

export async function fetchOfWorkPackageById(
  id: string,
): Promise<{ id: string; interface_type: "cnc" | "classique"; status: string } | null> {
  if (!connectivityMonitor.getStatus()) return null;
  const { data } = await supabase
    .from("of_work_packages")
    .select("id, interface_type, status")
    .eq("id", id)
    .maybeSingle();
  return (data as { id: string; interface_type: "cnc" | "classique"; status: string } | null) ?? null;
}

export async function fetchConsumedSecondsForPiece(pieceTaskId: string): Promise<number> {
  const nowMs = Date.now();

  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase
      .from("work_sessions")
      .select("started_at, ended_at, duration_seconds, voided_at")
      .eq("piece_task_id", pieceTaskId)
      .is("voided_at", null);

    if (!error && data) {
      const rows = data as Array<{
        started_at: string;
        ended_at: string | null;
        duration_seconds: number | null;
        voided_at: string | null;
      }>;
      let total = 0;
      for (const r of rows) {
        if (r.voided_at) continue;
        if (r.ended_at) {
          total += r.duration_seconds ?? Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000);
        } else {
          total += Math.round((nowMs - new Date(r.started_at).getTime()) / 1000);
        }
      }
      return total;
    }
  }

  const localRows = await localDb.workSessions
    .where("piece_task_id")
    .equals(pieceTaskId)
    .toArray();

  let total = 0;
  for (const r of localRows) {
    if (r.voided_at) continue;
    if (r.ended_at) {
      total += r.duration_seconds ?? Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000);
    } else {
      total += Math.round((nowMs - new Date(r.started_at).getTime()) / 1000);
    }
  }
  return total;
}

// ============================================================================
// Pièce d'urgence — ajout manuel par l'opérateur
// ============================================================================

export async function fetchAllProjectsForWorker(): Promise<Project[]> {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
    if (!error && data) {
      const rows = data as Project[];
      await localDb.projects.bulkPut(rows);
      return rows;
    }
  }
  return localDb.projects.where("company_id").equals(companyId).sortBy("name");
}

export async function searchPiecesInCompany(query: string): Promise<PieceTask[]> {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  if (connectivityMonitor.getStatus()) {
    const { data, error } = await supabase
      .from("pieces_tasks")
      .select("*")
      .eq("company_id", companyId)
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .neq("status", "cancelled")
      .limit(30);
    if (!error && data) {
      const rows = data as PieceTask[];
      await localDb.piecesTasks.bulkPut(rows);
      return rows;
    }
  }

  const all = await localDb.piecesTasks.where("company_id").equals(companyId).toArray();
  const lower = q.toLowerCase();
  return all
    .filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.code ?? "").toLowerCase().includes(lower),
    )
    .filter((p) => p.status !== "cancelled")
    .slice(0, 30);
}

interface CreateEmergencyPieceInput {
  workerId: string;
  shiftId: string | null;
  projectId: string;
  pieceName: string;
  pieceCode: string | null;
  quantity: number;
  technicalNotes: string | null;
  existingPieceTaskId?: string | null;
  machineId: string | null;
}

export async function createEmergencyPieceTask(
  input: CreateEmergencyPieceInput,
): Promise<{ pieceTaskId: string; planningId: string }> {
  const companyId = await resolveCompanyId();
  if (!companyId) throw new Error("تعذر تحديد شركة الجهاز الحالي");

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  let pieceTaskId = input.existingPieceTaskId ?? null;

  if (!pieceTaskId) {
    pieceTaskId = crypto.randomUUID();
    const newPiece: PieceTask = {
      id: pieceTaskId,
      company_id: companyId,
      project_id: input.projectId,
      name: input.pieceName,
      code: input.pieceCode,
      quantity: input.quantity,
      phase: "1",
      status: "in_progress",
      production_status: "in_progress",
      costing_status: "non_etudie",
      technical_status: "en_attente",
      technical_notes: input.technicalNotes,
      sequence_order: 0,
      created_at: now,
      updated_at: now,
      completed_at: null,
      manufacturing_order_id: null,
      nomenclature_id: null,
      estimated_minutes: null,
      estimated_time_minutes: null,
      cnc_estimated_hours: null,
      cnc_estimated_cost: null,
      scheduled_at: null,
      sent_to_production_at: null,
      technical_validated_at: null,
      material: null,
      drawing_url: null,
      primary_operation_type: null,
    };

    await localDb.piecesTasks.put(newPiece);

    if (connectivityMonitor.getStatus()) {
      const { error: pieceErr } = await supabase
        .from("pieces_tasks")
        .insert(newPiece as never);
      if (pieceErr) {
        await enqueueSync("pieces_tasks", "insert", newPiece as unknown as Record<string, unknown>);
      }
    } else {
      await enqueueSync("pieces_tasks", "insert", newPiece as unknown as Record<string, unknown>);
    }
  } else {
    if (input.technicalNotes) {
      const cached = await localDb.piecesTasks.get(pieceTaskId);
      if (cached) {
        await localDb.piecesTasks.put({ ...cached, technical_notes: input.technicalNotes });
      }
      if (connectivityMonitor.getStatus()) {
        await supabase
          .from("pieces_tasks")
          .update({ technical_notes: input.technicalNotes } as never)
          .eq("id", pieceTaskId);
      }
    }
  }

  const planningId = crypto.randomUUID();
  const newPlanning = {
    id: planningId,
    company_id: companyId,
    worker_id: input.workerId,
    machine_id: input.machineId,
    project_id: input.projectId,
    piece_task_id: pieceTaskId,
    of_work_package_id: null,
    manufacturing_order_id: null,
    planned_date: today,
    shift_number: "1",
    shift_start: null,
    shift_end: null,
    status: "scheduled",
    sequence_order: 1,
    notes: "[URGENT] Ajout manuel par opérateur",
    created_by: null,
    created_at: now,
    updated_at: now,
    started_at: null,
    completed_at: null,
  };

  await localDb.planning.put(newPlanning as never);

  if (connectivityMonitor.getStatus()) {
    const { error: planErr } = await supabase.from("planning").insert(newPlanning as never);
    if (planErr) {
      await enqueueSync("planning", "insert", newPlanning as unknown as Record<string, unknown>);
    }
  } else {
    await enqueueSync("planning", "insert", newPlanning as unknown as Record<string, unknown>);
  }

  return { pieceTaskId, planningId };
}

// ============================================================================
// Kiosk Planning Viewer — vue jour par jour pour l'opérateur (lecture seule)
// ============================================================================

export interface KioskPlanningCard {
  planning_id: string;
  machine_id: string;
  machine_name: string;
  machine_code: string | null;
  machine_interface: string | null;
  worker_id: string;
  worker_name: string | null;
  project_id: string | null;
  project_name: string | null;
  project_code: string | null;
  piece_task_id: string | null;
  piece_name: string | null;
  piece_code: string | null;
  quantity: number | null;
  material: string | null;
  client_name: string | null;
  shift_number: number;
  sequence_order: number;
  status: string;
  estimated_time_minutes: number | null;
  of_work_package_id: string | null;
  wp_interface: "cnc" | "classique" | null;
  wp_label: string | null;
  order_number: string | null;
  product_name: string | null;
  cell_worker_id: string | null;
  cell_worker_name: string | null;
}

function parseShiftNumberForKiosk(raw: string | null): number {
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n)) return n;
  const m = raw.match(/poste_(\d+)/);
  if (m) return parseInt(m[1], 10) || 1;
  return 1;
}

export async function fetchDayPlanningForKiosk(date: string): Promise<KioskPlanningCard[]> {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];
  if (!connectivityMonitor.getStatus()) return [];

  // 1. Planning + joins
  const { data, error } = await supabase
    .from("planning")
    .select(
      "id, machine_id, worker_id, project_id, piece_task_id, shift_number, sequence_order, status, of_work_package_id, " +
        "machines(id, name, code, interface_type), " +
        "workers(id, full_name), " +
        "projects(id, name, code, clients(name)), " +
        "pieces_tasks(id, name, code, quantity, material), " +
        "of_work_packages(id, interface_type, label), " +
        "manufacturing_orders(id, order_number, product_name)",
    )
    .eq("company_id", companyId)
    .eq("planned_date", date)
    .in("status", ["scheduled", "in_progress"])
    .order("shift_number")
    .order("sequence_order");

  if (error || !data) {
    console.error("[KioskPlanningViewer] load error:", error);
    return [];
  }

  // 2. Cell workers pour la même date
  const { data: cwData } = await supabase
    .from("planning_cell_workers")
    .select("machine_id, shift_number, worker_id")
    .eq("company_id", companyId)
    .eq("planned_date", date);

  const cellWorkersMap = new Map<string, string>();
  const cellWorkerIds = new Set<string>();
  for (const cw of (cwData ?? []) as Array<{
    machine_id: string;
    shift_number: string;
    worker_id: string;
  }>) {
    const key = `${cw.machine_id}__${parseShiftNumberForKiosk(cw.shift_number)}`;
    cellWorkersMap.set(key, cw.worker_id);
    cellWorkerIds.add(cw.worker_id);
  }

  // 3. Noms des cell workers
  const workersMap = new Map<string, string>();
  for (const r of data as unknown as Array<{ workers: { id?: string; full_name?: string } | null }>) {
    if (r.workers?.id && r.workers.full_name) {
      workersMap.set(r.workers.id, r.workers.full_name);
    }
  }
  const missingWorkerIds = Array.from(cellWorkerIds).filter((id) => !workersMap.has(id));
  if (missingWorkerIds.length > 0) {
    const { data: workersData } = await supabase
      .from("workers")
      .select("id, full_name")
      .in("id", missingWorkerIds);
    for (const w of (workersData ?? []) as Array<{ id: string; full_name: string }>) {
      workersMap.set(w.id, w.full_name);
    }
  }

  // 4. Opérations de chiffrage pour toutes les pièces du jour
  const pieceIds = Array.from(
    new Set(
      (data as unknown as Array<{ piece_task_id: string | null }>)
        .map((r) => r.piece_task_id)
        .filter((x): x is string => !!x),
    ),
  );

  const opsByPiece = new Map<string, Array<{ stage: string; estimated_hours: number }>>();
  if (pieceIds.length > 0) {
    const { data: opsData } = await supabase
      .from("piece_costing_operations")
      .select("piece_task_id, stage, estimated_hours")
      .eq("company_id", companyId)
      .in("piece_task_id", pieceIds);

    for (const op of (opsData ?? []) as Array<{
      piece_task_id: string | null;
      stage: string;
      estimated_hours: number;
    }>) {
      if (!op.piece_task_id) continue;
      const arr = opsByPiece.get(op.piece_task_id) ?? [];
      arr.push({ stage: op.stage, estimated_hours: op.estimated_hours });
      opsByPiece.set(op.piece_task_id, arr);
    }
  }

  // 5. Construire les cartes
  const rows = data as unknown as Array<{
    id: string;
    machine_id: string | null;
    worker_id: string;
    project_id: string | null;
    piece_task_id: string | null;
    shift_number: string | null;
    sequence_order: number | null;
    status: string;
    of_work_package_id: string | null;
    machines: { id?: string; name?: string; code?: string | null; interface_type?: string } | null;
    workers: { id?: string; full_name?: string } | null;
    projects: {
      id?: string;
      name?: string;
      code?: string | null;
      clients?: { name?: string } | null;
    } | null;
    pieces_tasks: {
      id?: string;
      name?: string;
      code?: string | null;
      quantity?: number;
      material?: string | null;
    } | null;
    of_work_packages: { id?: string; interface_type?: string; label?: string | null } | null;
    manufacturing_orders: {
      id?: string;
      order_number?: string;
      product_name?: string;
    } | null;
  }>;

  const cards: KioskPlanningCard[] = rows.map((r) => {
    const machineId = r.machine_id ?? r.machines?.id ?? "";
    const shiftN = parseShiftNumberForKiosk(r.shift_number);
    const cellKey = `${machineId}__${shiftN}`;
    const cellWorkerId = cellWorkersMap.get(cellKey) ?? null;
    const cellWorkerName = cellWorkerId ? workersMap.get(cellWorkerId) ?? null : null;

    const wpInterface =
      (r.of_work_packages?.interface_type as "cnc" | "classique" | undefined) ?? null;

    let estimatedMin: number | null = null;
    if (r.piece_task_id) {
      const ops = opsByPiece.get(r.piece_task_id);
      if (ops && ops.length > 0) {
        const filtered = wpInterface
          ? ops.filter((op) => getStageInterface(op.stage) === wpInterface)
          : ops;
        const total = filtered.reduce(
          (sum, op) => sum + Math.round(op.estimated_hours * 60),
          0,
        );
        estimatedMin = total > 0 ? total : null;
      }
    }

    return {
      planning_id: r.id,
      machine_id: machineId,
      machine_name: r.machines?.name ?? "",
      machine_code: r.machines?.code ?? null,
      machine_interface: r.machines?.interface_type ?? null,
      worker_id: r.worker_id,
      worker_name: r.workers?.full_name ?? null,
      project_id: r.project_id,
      project_name: r.projects?.name ?? null,
      project_code: r.projects?.code ?? null,
      piece_task_id: r.piece_task_id,
      piece_name: r.pieces_tasks?.name ?? null,
      piece_code: r.pieces_tasks?.code ?? null,
      quantity: r.pieces_tasks?.quantity ?? null,
      material: r.pieces_tasks?.material ?? null,
      client_name: r.projects?.clients?.name ?? null,
      shift_number: shiftN,
      sequence_order: r.sequence_order ?? 1,
      status: r.status,
      estimated_time_minutes: estimatedMin,
      of_work_package_id: r.of_work_package_id,
      wp_interface: wpInterface,
      wp_label: r.of_work_packages?.label ?? null,
      order_number: r.manufacturing_orders?.order_number ?? null,
      product_name: r.manufacturing_orders?.product_name ?? null,
      cell_worker_id: cellWorkerId,
      cell_worker_name: cellWorkerName,
    };
  });

  return cards;
}