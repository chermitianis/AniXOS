// ============================================================================
// kioskApi: طبقة وصول موحدة لبيانات الكشك (أونلاين أولاً، كاش أوفلاين تلقائياً)
// كل دالة هنا: تحاول أونلاين → تُحدِّث الكاش المحلي عند النجاح → أو تقرأ من
// الكاش مباشرة عند الانقطاع. الواجهة (React) لا تحتاج معرفة أي من الحالتين.
//
// مفهومان منفصلان بنيوياً (لا يجب الخلط بينهما):
//   - الحصة (WorkShift): دوام العامل الكامل، من تسجيل الدخول إلى تسجيل
//     الخروج فقط. تُدار عبر startWorkerShift/endWorkerShift.
//   - الحدث (WorkSession): مهمة إنتاجية أو سبب توقف داخل الحصة. يمكن أن
//     يكون للعامل حتى 3 أحداث مفتوحة بالتوازي (toggleWorkerEvent).
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";
import { localDb } from "../../../lib/localDb";
import { connectivityMonitor } from "../../../lib/connectivity";
import { enqueueSync } from "../../../lib/syncQueue";
import { resolveCompanyId } from "../../../lib/companyContext";
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

/** يُرمى عند محاولة تشغيل حدث رابع — الواجهة تلتقطه لعرض رسالة واضحة */
export class MaxActiveEventsError extends Error {
  constructor() {
    super("MAX_ACTIVE_EVENTS_REACHED");
    this.name = "MaxActiveEventsError";
  }
}

// ------------------------------------------------------------------
// أنواع المهام الإنتاجية (العمود الأزرق)
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

// ------------------------------------------------------------------
// أسباب التوقف (العمود البرتقالي)
// ------------------------------------------------------------------
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
// مهام المخطط لهذا العامل (لتعبئة السياق تلقائياً)
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
      // اليوم أولاً، ثم التخصيصات المتأخرة؛ لا نبدأ بمهمة قديمة إذا وُجدت مهمة اليوم.
      .order("planned_date", { ascending: false })
      .order("shift_number");

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
    .then((rows) => rows.sort((a, b) => {
      const dateOrder = b.planned_date.localeCompare(a.planned_date);
      if (dateOrder !== 0) return dateOrder;
      return String(a.shift_number ?? "").localeCompare(String(b.shift_number ?? ""));
    }));
}

export async function fetchTodayPlanningForWorker(workerId: string): Promise<PlanningEntry | null> {
  const queue = await fetchWorkerPlanningQueue(workerId);
  return queue[0] ?? null;
}

/** يعيد سطر التخطيط عند الحاجة لاستعادة سياق جلسة إنتاج مفتوحة. */
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

// ------------------------------------------------------------------
// جلب آلة/مشروع/قطعة بمعرّفها
// ------------------------------------------------------------------
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

/** كل قطع مشروع معيّن، مرتبة حسب ترتيب المخطط؛ غير المكتملة أولاً */
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
// الحصة (WorkShift) — دوام العامل الكامل، منفصل عن الأحداث
// ============================================================================

/** يُعاد إلى طبقة العرض عندما يملك العامل حصة مفتوحة على جهاز آخر. */
export class WorkerAlreadyConnectedError extends Error {
  constructor() {
    super("WORKER_ALREADY_CONNECTED");
    this.name = "WorkerAlreadyConnectedError";
  }
}

/** تبدأ عند تسجيل دخول العامل فقط. تُستدعى مرة واحدة لكل دخول حقيقي؛ إعادة
 * تحميل الصفحة لا تُنشئ حصة جديدة لأن WorkerSessionContext يستعيد shift_id
 * المحفوظ محلياً بدل استدعاء هذه الدالة مجدداً. */
export async function startWorkerShift(workerId: string, deviceId: string | null): Promise<WorkShift> {
  const companyId = await resolveCompanyId();
  if (!companyId) throw new Error("تعذر تحديد شركة الجهاز الحالي");

  // فحص محلي مكمل: يمنع إنشاء حصة ثانية حتى عندما يكون الجهاز مؤقتاً بلا
  // اتصال. القفل المركزي أدناه هو المرجع النهائي عند الاتصال.
  const localExisting = await localDb.workShifts
    .where("worker_id")
    .equals(workerId)
    .filter((shift) => shift.ended_at === null)
    .first();
  if (localExisting) throw new WorkerAlreadyConnectedError();

  // فحص أول: هل توجد أصلاً حصة مفتوحة لهذا العامل؟ (يمنع الإدراج المكرر عند
  // نقرة مزدوجة على زر الدخول أو استدعاء مزدوج في وضع React StrictMode)
  if (connectivityMonitor.getStatus()) {
    const { data: existing, error: existingError } = await supabase
      .from("work_shifts")
      .select("*")
      .eq("worker_id", workerId)
      .is("ended_at", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      // لا نعيد استخدام الحصة: وجودها يعني أن العامل ما زال متصلاً من
      // جهاز آخر. تسجيل الخروج الصريح فقط يحرر القفل المركزي.
      throw new WorkerAlreadyConnectedError();
    }
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

    // تعافٍ ذاتي: إن كان الفشل بسبب انتهاك قيد "حصة واحدة مفتوحة لكل عامل"
    // (23505) — فهذا يعني أن حصة أخرى فازت بالسباق للتو؛ نجلبها ونستخدمها
    // بدل تكديس هذا الإدراج الفاشل في طابور سيفشل إلى الأبد.
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

/** تنتهي فقط بتسجيل الخروج الصريح: تُغلق كل الأحداث المفتوحة أولاً (تُحسب
 * ضمن الوقت الفعلي)، ثم تُغلق الحصة نفسها. */
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

/** كل الأحداث المفتوحة حالياً لهذا العامل (حتى 3) — أساس عرض الأزرار النشطة */
export async function fetchOpenSessionsForWorker(workerId: string): Promise<WorkSession[]> {
  return localDb.workSessions
    .where("worker_id")
    .equals(workerId)
    .filter((s) => s.ended_at === null && !s.voided_at)
    .toArray();
}

// ============================================================================
// shift_piece_work: القطع/المشاريع التي اشتغل عليها العامل خلال الحصة —
// البداية عند اختيار القطعة، والنهاية عند Terminer أو تبديل القطعة أو نهاية
// الحصة (تسجيل الخروج دون Terminer) — الجدول الثاني في تقرير الحصة.
// ============================================================================

/** يفتح فترة اشتغال جديدة على قطعة ضمن الحصة، أو يعيد استخدام الفترة
 * المفتوحة أصلاً لنفس القطعة+الحصة إن وُجدت (idempotent — يحمي من التكرار
 * عند استعادة السياق بعد إعادة تحميل الصفحة). */
export async function openShiftPieceWork(
  shiftId: string | null,
  workerId: string,
  pieceTaskId: string,
  projectId: string | null
): Promise<void> {
  if (!shiftId) return;

  // فحص محلي أول (سريع)، ثم فحص القاعدة الفعلية إن كنا أونلاين — الكاش
  // المحلي وحده لا يكفي لمنع السباق عند استدعاء الدالة مرتين بالتوازي
  // (مثال: React StrictMode يُشغّل useEffect مرتين عند التركيب في التطوير).
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

    // تعافٍ ذاتي عند تعارض 23505: استدعاء موازٍ آخر فاز بالسباق للتو —
    // نتراجع عن سطرنا المحلي ونتبنّى السطر الفائز بدل إعادة محاولة عقيمة.
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

/** يُغلق الفترة المفتوحة على قطعة معيّنة ضمن الحصة (عند Terminer أو عند
 * تبديل القطعة إلى أخرى دون الضغط على Terminer). */
export async function closeShiftPieceWork(shiftId: string | null, pieceTaskId: string, endedAt?: string): Promise<void> {
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
    const { error } = await supabase.from("shift_piece_work").update({ ended_at: closedRow.ended_at }).eq("id", openRow.id);
    if (!error) return;
  }
  await enqueueSync("shift_piece_work", "update", closedRow as unknown as Record<string, unknown>);
}

/** يُغلق كل فترات الاشتغال المفتوحة لحصة بأكملها — يُستدعى عند تسجيل الخروج
 * (نهاية الحصة دون الضغط على Terminer لآخر قطعة كانت قيد العمل). */
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
      const { error } = await supabase.from("shift_piece_work").update({ ended_at: endedAt }).eq("id", row.id);
      if (!error) continue;
    }
    await enqueueSync("shift_piece_work", "update", closedRow as unknown as Record<string, unknown>);
  }
}

/** يبدّل السياق من قطعة إلى أخرى ضمن نفس الحصة: يُغلق فترة القطعة القديمة
 * (إن وُجدت ومختلفة) ويفتح فترة جديدة للقطعة الجديدة. */
export async function switchShiftPiece(
  shiftId: string | null,
  workerId: string,
  previousPieceTaskId: string | null,
  newPieceTaskId: string,
  newProjectId: string | null
): Promise<void> {
  if (previousPieceTaskId && previousPieceTaskId !== newPieceTaskId) {
    await closeShiftPieceWork(shiftId, previousPieceTaskId);
  }
  await openShiftPieceWork(shiftId, workerId, newPieceTaskId, newProjectId);
}

// ============================================================================
// الحدث (WorkSession): toggle بحد 3 أحداث نشطة بالتوازي للعامل الواحد
// ============================================================================

interface ToggleEventInput {
  workerId: string;
  shiftId: string | null;
  machineId: string | null;
  projectId: string | null;
  pieceTaskId: string | null;
  planningId: string | null;
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

/**
 * نقرة أولى = بدء الحدث، نقرة ثانية على نفس البطاقة = إيقافه — بدل النموذج
 * القديم الذي كان يُغلق أي حدث آخر مفتوح تلقائياً عند بدء حدث جديد.
 * يرمي MaxActiveEventsError إذا كان للعامل بالفعل 3 أحداث نشطة ولم يكن هذا
 * toggle-off لأحدها.
 */
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

/** يُغلق كل الأحداث المفتوحة لعامل معيّن على قطعة محددة — يُستخدم عند
 * الضغط على Terminer/À continuer، وليس عند تسجيل الخروج (شامل كل القطع). */
async function closeOpenSessionsForWorkerPiece(workerId: string, pieceTaskId: string): Promise<void> {
  const open = await fetchOpenSessionsForWorker(workerId);
  for (const s of open.filter((s) => s.piece_task_id === pieceTaskId)) {
    await closeSession(s);
  }
}

/** يُغلق كل الأحداث المفتوحة لعامل معيّن مهما كانت القطعة — يُستخدم فقط عند
 * إنهاء الحصة بالكامل (تسجيل الخروج). */
export async function closeAllOpenSessionsForWorker(workerId: string): Promise<void> {
  const open = await fetchOpenSessionsForWorker(workerId);
  for (const s of open) {
    await closeSession(s);
  }
}

async function updatePieceTaskStatusIfPending(pieceTaskId: string): Promise<void> {
  if (connectivityMonitor.getStatus()) {
    await supabase.from("pieces_tasks").update({ status: "in_progress" }).eq("id", pieceTaskId).eq("status", "pending");
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
  eventLabel: string
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

// ------------------------------------------------------------------
// Terminer / À continuer
// ------------------------------------------------------------------

/**
 * زر "Terminer": القطعة انتهت بالكامل. تُغلق كل الأحداث المفتوحة على هذه
 * القطعة تحديداً لهذا العامل (تُحسب ضمن الوقت الفعلي الإجمالي)، ثم تُعلَّم
 * القطعة "مكتملة" — يمنع الإكمال المكرر إن كانت مكتملة أصلاً.
 */
export async function markPieceTaskComplete(pieceTaskId: string, workerId: string, shiftId: string | null): Promise<void> {
  const cachedPiece = await localDb.piecesTasks.get(pieceTaskId);
  if (cachedPiece?.status === "completed") {
    return; // منع الإكمال المكرر
  }

  await closeOpenSessionsForWorkerPiece(workerId, pieceTaskId);
  await closeShiftPieceWork(shiftId, pieceTaskId);

  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase
      .from("pieces_tasks")
      .update({ status: "completed" })
      .eq("id", pieceTaskId)
      .neq("status", "completed");
    if (!error) {
      await localDb.piecesTasks.update(pieceTaskId, { status: "completed" });
      await logActivity(workerId, null, null, "piece_completed", "Pièce terminée ✓");
      return;
    }
  }

  if (!cachedPiece) {
    console.error("تعذر إكمال القطعة أوفلاين: لا توجد نسخة محلية كافية منها");
    return;
  }

  const updatedPiece = { ...cachedPiece, status: "completed" as const };
  await localDb.piecesTasks.put(updatedPiece);
  await enqueueSync("pieces_tasks", "update", updatedPiece as unknown as Record<string, unknown>);
  await logActivity(workerId, null, null, "piece_completed", "Pièce terminée ✓ (hors ligne)");
}

/**
 * زر "À continuer": القطعة لا تزال قيد التنفيذ. تُغلق أحداث هذه القطعة
 * المفتوحة لهذا العامل (يُحفظ الوقت المنجَز)، وتبقى القطعة "in_progress"
 * لتُستأنف لاحقاً (بنفس العامل أو آخر) وتُجمَع كل الفترات في التقرير الموحد.
 */
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
  if (cached) await enqueueSync("pieces_tasks", "update", { ...cached, phase: value } as unknown as Record<string, unknown>);
}

// ------------------------------------------------------------------
// سجل الأحداث والتصحيحات — بدون حذف فعلي أبداً، مع سجل تدقيق كامل
// ------------------------------------------------------------------

export interface CorrectionContext {
  reason: string;
  correctedByType: CorrectedByType;
  correctedByStaffId?: string | null;
  correctedByWorkerId?: string | null;
}

/**
 * يُعدّل توقيت/مدة حدث موجود. لا يحذف أي شيء أبداً: يُسجَّل التعديل في
 * work_session_corrections (من قام به، متى، القيمة القديمة والجديدة، السبب)
 * ثم تُحدَّث القيم الجديدة على السجل نفسه.
 */
export async function correctWorkSession(
  session: WorkSession,
  durationSeconds: number,
  context: CorrectionContext
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

/**
 * "حذف" حدث من الحسابات النهائية — لا يُنفَّذ كحذف فعلي في القاعدة، بل
 * كإلغاء (voided_at) يُبقي السطر كاملاً في سجل التدقيق ويستبعده فقط من
 * التقارير (v_project_actuals/v_piece_task_actuals تستبعد voided_at is not null).
 */
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
  context: CorrectionContext
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

/** سجل تصحيحات حدث معيّن — لعرض "من/متى/القيمة القديمة والجديدة/السبب" */
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
  return localDb.workSessionCorrections.where("work_session_id").equals(workSessionId).reverse().sortBy("created_at");
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

/** جلسات اليوم للعامل (شاملة الملغاة، لعرضها مشطوبة في سجل الأحداث) */
export async function fetchWorkerSessionsToday(workerId: string): Promise<WorkSession[]> {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await localDb.workSessions.where("worker_id").equals(workerId).toArray();
  return sessions.filter((s) => s.started_at.startsWith(today));
}

// ------------------------------------------------------------------
// Passation — مرتبطة بالقطعة والمشروع والحصة والعامل، وليست رسائل عامة
// ------------------------------------------------------------------
export async function createPieceHandoff(
  pieceTaskId: string,
  projectId: string | null,
  shiftId: string | null,
  workerId: string,
  message: string,
  toWorkerId: string | null = null
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
    const { data, error } = await supabase.from("piece_handoffs").select("*").eq("piece_task_id", pieceTaskId).order("created_at", { ascending: false });
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

// ------------------------------------------------------------------
// Réclamation — إبلاغ العامل للإدارة بمشكلة أو طلب (قسم Maintenance et Besoins)
// ------------------------------------------------------------------
export async function createReclamation(
  workerId: string,
  machineId: string | null,
  message: string
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

// ------------------------------------------------------------------
// المخطط الكامل لكل آلة — زر "Planning" في واجهة الكشك
// ------------------------------------------------------------------
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

/** يجلب مخطط كل الآلات ليوم واحد محدد (افتراضياً اليوم) — يحتاج اتصالاً
 * بالإنترنت. يتيح للعامل التنقل بين الأمس/اليوم/الغد أو أي تاريخ مستقبلي
 * وضعه المسؤول، عبر تمرير قيمة date مختلفة */
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
