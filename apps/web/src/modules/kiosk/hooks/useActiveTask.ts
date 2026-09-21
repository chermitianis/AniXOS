// ============================================================================
// useActiveTask: القلب النابض لواجهة الكشك.
// يدير: تعبئة السياق تلقائياً من المخطط عند الدخول، الاختيار اليدوي، وحتى
// 3 أحداث نشطة بالتوازي (activeSessions) بدل جلسة واحدة فقط — نقرة أولى
// تبدأ الحدث، نقرة ثانية على نفس البطاقة توقفه. تُستعاد الأحداث المفتوحة
// تلقائياً بعد إعادة تحميل الصفحة أو إعادة تشغيل الجهاز (لا تُفقَد).
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import {
  fetchTodayPlanningForWorker,
  fetchPlanningById,
  fetchMachineById,
  fetchProjectById,
  fetchPieceTaskById,
  fetchOpenSessionsForWorker,
  toggleWorkerEvent,
  MaxActiveEventsError,
  markPieceTaskComplete,
  pauseWorkOnPiece,
  updatePiecePhase,
  openShiftPieceWork,
  switchShiftPiece,
} from "../api/kioskApi";
import type { PlanningProjectOption } from "./useWorkerPlanning";
import type {
  Machine,
  Project,
  PieceTask,
  WorkSession,
  TaskType,
  StopReason,
} from "../../../shared/types/database";

export type ToggleResult = { ok: true } | { ok: false; reason: "max_active" };

interface ActiveTaskState {
  machine: Machine | null;
  project: Project | null;
  pieceTask: PieceTask | null;
  planningId: string | null;
  /** حتى 3 أحداث نشطة بالتوازي لهذا العامل — وليس حدثاً واحداً */
  activeSessions: WorkSession[];
  isLoadingContext: boolean;
  setMachine: (machine: Machine | null) => void;
  setProject: (project: Project | null) => void;
  setPieceTask: (pieceTask: PieceTask | null) => void;
  selectPlanningOption: (option: PlanningProjectOption, piece: PieceTask | null) => Promise<void>;
  toggleProductionTask: (taskType: TaskType) => Promise<ToggleResult>;
  toggleStopReason: (reason: StopReason, note?: string) => Promise<ToggleResult>;
  completePiece: () => Promise<void>;
  pausePiece: () => Promise<void>;
  changePhase: (delta: number) => Promise<void>;
  refreshActiveSessions: () => Promise<void>;
}

export function useActiveTask(workerId: string, shiftId: string | null): ActiveTaskState {
  const [machine, setMachine] = useState<Machine | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [pieceTask, setPieceTask] = useState<PieceTask | null>(null);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<WorkSession[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  // تعبئة السياق تلقائياً من المخطط + استعادة أي أحداث مفتوحة سابقاً (إعادة
  // تحميل الصفحة أو إعادة تشغيل الجهاز لا يجب أن تُفقِد الأحداث النشطة)
  useEffect(() => {
    let isMounted = true;

    async function loadInitialContext() {
      setIsLoadingContext(true);

      const [planning, openSessions] = await Promise.all([
        fetchTodayPlanningForWorker(workerId),
        fetchOpenSessionsForWorker(workerId),
      ]);

      if (isMounted) setActiveSessions(openSessions);

      // أولوية السياق: قطعة لها حدث مفتوح فعلاً أولى من أول مهمة في المخطط
      const openPieceId = openSessions.find((s) => s.piece_task_id)?.piece_task_id ?? null;

      if (openPieceId && isMounted) {
        const openSession = openSessions.find((s) => s.piece_task_id === openPieceId) ?? null;
        const piece = await fetchPieceTaskById(openPieceId);
        if (isMounted && piece) {
          setPlanningId(openSession?.planning_id ?? null);
          const planning = openSession?.planning_id ? await fetchPlanningById(openSession.planning_id) : null;
          const machineId = openSession?.machine_id ?? planning?.machine_id ?? null;
          const projectId = openSession?.project_id ?? planning?.project_id ?? piece.project_id;
          setMachine(machineId ? await fetchMachineById(machineId) : null);
          setPieceTask(piece);
          setProject(await fetchProjectById(projectId));
          await openShiftPieceWork(shiftId, workerId, piece.id, piece.project_id);
        }
      } else if (planning && isMounted) {
        setPlanningId(planning.id);
        const [machineData, projectData, pieceData] = await Promise.all([
          planning.machine_id ? fetchMachineById(planning.machine_id) : Promise.resolve(null),
          planning.project_id ? fetchProjectById(planning.project_id) : Promise.resolve(null),
          planning.piece_task_id ? fetchPieceTaskById(planning.piece_task_id) : Promise.resolve(null),
        ]);
        if (isMounted) {
          setMachine(machineData);
          setProject(projectData);
          setPieceTask(pieceData);
          if (pieceData) {
            await openShiftPieceWork(shiftId, workerId, pieceData.id, pieceData.project_id);
          }
        }
      }

      if (isMounted) setIsLoadingContext(false);
    }

    void loadInitialContext();
    return () => {
      isMounted = false;
    };
  }, [workerId, shiftId]);

  const selectPlanningOption = useCallback(
    async (option: PlanningProjectOption, piece: PieceTask | null) => {
      const matchingEntry =
        option.entries.find((e) => e.piece_task_id === piece?.id) ?? option.entries[0] ?? null;

      const previousPieceId = pieceTask?.id ?? null;

      setProject(option.project);
      setPieceTask(piece);
      setPlanningId(matchingEntry?.id ?? null);

      if (matchingEntry?.machine_id) {
        setMachine(await fetchMachineById(matchingEntry.machine_id));
      } else {
        setMachine(null);
      }

      if (piece) {
        await switchShiftPiece(shiftId, workerId, previousPieceId, piece.id, piece.project_id);
      }
    },
    [pieceTask, shiftId, workerId]
  );

  const toggleProductionTask = useCallback(
    async (taskType: TaskType): Promise<ToggleResult> => {
      try {
        await toggleWorkerEvent({
          workerId,
          shiftId,
          machineId: machine?.id ?? null,
          projectId: project?.id ?? null,
          pieceTaskId: pieceTask?.id ?? null,
          planningId,
          sessionType: "production",
          taskTypeId: taskType.id,
          stopReasonId: null,
        });
        setActiveSessions(await fetchOpenSessionsForWorker(workerId));
        return { ok: true };
      } catch (err) {
        if (err instanceof MaxActiveEventsError) return { ok: false, reason: "max_active" };
        throw err;
      }
    },
    [workerId, shiftId, machine, project, pieceTask, planningId]
  );

  const toggleStopReason = useCallback(
    async (reason: StopReason, note?: string): Promise<ToggleResult> => {
      try {
        await toggleWorkerEvent({
          workerId,
          shiftId,
          machineId: machine?.id ?? null,
          projectId: project?.id ?? null,
          pieceTaskId: pieceTask?.id ?? null,
          planningId,
          sessionType: "downtime",
          taskTypeId: null,
          stopReasonId: reason.id,
          note,
        });
        setActiveSessions(await fetchOpenSessionsForWorker(workerId));
        return { ok: true };
      } catch (err) {
        if (err instanceof MaxActiveEventsError) return { ok: false, reason: "max_active" };
        throw err;
      }
    },
    [workerId, shiftId, machine, project, pieceTask, planningId]
  );

  /** زر Terminer: القطعة انتهت بالكامل — تُغلق أحداثها المفتوحة فقط */
  const completePiece = useCallback(async () => {
    if (!pieceTask) return;
    await markPieceTaskComplete(pieceTask.id, workerId, shiftId);
    setPieceTask(null);
    setActiveSessions(await fetchOpenSessionsForWorker(workerId));
  }, [pieceTask, workerId, shiftId]);

  /** زر À continuer: العمل لا يزال جارياً — تُغلق أحداث هذه القطعة فقط */
  const pausePiece = useCallback(async () => {
    if (!pieceTask) return;
    await pauseWorkOnPiece(pieceTask.id, workerId);
    setActiveSessions(await fetchOpenSessionsForWorker(workerId));
  }, [pieceTask, workerId]);

  const changePhase = useCallback(async (delta: number) => {
    if (!pieceTask) return;
    const current = Number.parseInt(pieceTask.phase ?? "1", 10) || 1;
    const next = Math.max(1, current + delta);
    setPieceTask((previous) => previous ? { ...previous, phase: String(next) } : previous);
    await updatePiecePhase(pieceTask.id, next);
  }, [pieceTask]);

  /** إعادة تحميل الأحداث المفتوحة بعد تصحيح/إلغاء حدث من نافذة التدقيق
   * (تُستدعى من خارج toggle، مثل SessionCorrectionModal) */
  const refreshActiveSessions = useCallback(async () => {
    setActiveSessions(await fetchOpenSessionsForWorker(workerId));
  }, [workerId]);

  return {
    machine,
    project,
    pieceTask,
    planningId,
    activeSessions,
    isLoadingContext,
    setMachine,
    setProject,
    setPieceTask,
    selectPlanningOption,
    toggleProductionTask,
    toggleStopReason,
    completePiece,
    pausePiece,
    changePhase,
    refreshActiveSessions,
  };
}
