// ============================================================================
// useActiveTask: القلب النابض لواجهة الكشك.
// يدير: تعبئة السياق تلقائياً من المخطط، الاختيار اليدوي، وحتى 3 أحداث
// نشطة بالتوازي.
//
// ⚠️ إضافة 2026-09-30 :
//   - ofWorkPackageInterface : "cnc" | "classique" | null
//     يُستخدم في KioskMainPage لفلترة الوقت التقديري.
//
// ⚠️ إضافة 2026-10-02 :
//   - consumedSeconds : الوقت المستهلك على القطعة (production + downtime)
//     من work_sessions، لحساب "الوقت المتبقي" في ContextBar.
//     يُحدّث كل 30 ثانية تلقائياً أثناء وجود قطعة نشطة.
// ============================================================================

import { useEffect, useState, useCallback, useRef } from "react";
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
  fetchOfWorkPackageById,
  fetchConsumedSecondsForPiece,  // ✅ NEW
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
export type WpInterface = "cnc" | "classique";

const MAX_PHASE = 200;
const CONSUMED_REFRESH_INTERVAL_MS = 30_000; // 30s

interface ActiveTaskState {
  machine: Machine | null;
  project: Project | null;
  pieceTask: PieceTask | null;
  planningId: string | null;
  ofWorkPackageId: string | null;
  /** ✅ interface de la WP active — pour filtrer l'estimation. */
  ofWorkPackageInterface: WpInterface | null;
  /** ✅ NEW : temps consommé (secondes) sur la pièce active. */
  consumedSeconds: number;
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
  /** ✅ NEW : force le recalcul de consumedSeconds. */
  refreshConsumedSeconds: () => Promise<void>;
}

export function useActiveTask(workerId: string, shiftId: string | null): ActiveTaskState {
  const [machine, setMachine] = useState<Machine | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [pieceTask, setPieceTask] = useState<PieceTask | null>(null);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [ofWorkPackageId, setOfWorkPackageId] = useState<string | null>(null);
  const [ofWorkPackageInterface, setOfWorkPackageInterface] = useState<WpInterface | null>(null);
  const [consumedSeconds, setConsumedSeconds] = useState<number>(0);  // ✅ NEW
  const [activeSessions, setActiveSessions] = useState<WorkSession[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  const ofWpRef = useRef<string | null>(null);
  useEffect(() => { ofWpRef.current = ofWorkPackageId; }, [ofWorkPackageId]);

  // Réf. sur l'id de la pièce active — pour éviter les dépendances cycliques
  const pieceIdRef = useRef<string | null>(null);
  useEffect(() => { pieceIdRef.current = pieceTask?.id ?? null; }, [pieceTask?.id]);

  // ✅ NEW : recalcul de consumedSeconds pour la pièce active
  const refreshConsumedSeconds = useCallback(async () => {
    const pid = pieceIdRef.current;
    if (!pid) {
      setConsumedSeconds(0);
      return;
    }
    const seconds = await fetchConsumedSecondsForPiece(pid);
    setConsumedSeconds(seconds);
  }, []);

  // ✅ NEW : rafraîchit consumedSeconds à chaque changement de pièce
  useEffect(() => {
    void refreshConsumedSeconds();
  }, [pieceTask?.id, refreshConsumedSeconds]);

  // ✅ NEW : polling toutes les 30s pendant qu'une pièce est active
  useEffect(() => {
    if (!pieceTask?.id) return;
    const interval = setInterval(() => {
      void refreshConsumedSeconds();
    }, CONSUMED_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pieceTask?.id, refreshConsumedSeconds]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialContext() {
      setIsLoadingContext(true);

      const [planning, openSessions] = await Promise.all([
        fetchTodayPlanningForWorker(workerId),
        fetchOpenSessionsForWorker(workerId),
      ]);

      if (isMounted) setActiveSessions(openSessions);

      const openPieceId = openSessions.find((s) => s.piece_task_id)?.piece_task_id ?? null;

      if (openPieceId && isMounted) {
        const openSession = openSessions.find((s) => s.piece_task_id === openPieceId) ?? null;
        const piece = await fetchPieceTaskById(openPieceId);
        if (isMounted && piece) {
          setPlanningId(openSession?.planning_id ?? null);
          const planningFromId = openSession?.planning_id ? await fetchPlanningById(openSession.planning_id) : null;
          const machineId = openSession?.machine_id ?? planningFromId?.machine_id ?? null;
          const projectId = openSession?.project_id ?? planningFromId?.project_id ?? piece.project_id;
          setMachine(machineId ? await fetchMachineById(machineId) : null);
          setPieceTask(piece);
          setProject(await fetchProjectById(projectId));

          const wpId = openSession?.of_work_package_id ?? planningFromId?.of_work_package_id ?? null;
          setOfWorkPackageId(wpId);
          if (wpId) {
            const wp = await fetchOfWorkPackageById(wpId);
            setOfWorkPackageInterface(wp?.interface_type ?? null);
          } else {
            setOfWorkPackageInterface(null);
          }

          await openShiftPieceWork(shiftId, workerId, piece.id, piece.project_id);
        }
      } else if (planning && isMounted) {
        setPlanningId(planning.id);
        setOfWorkPackageId(planning.of_work_package_id ?? null);
        if (planning.of_work_package_id) {
          const wp = await fetchOfWorkPackageById(planning.of_work_package_id);
          setOfWorkPackageInterface(wp?.interface_type ?? null);
        } else {
          setOfWorkPackageInterface(null);
        }

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
    return () => { isMounted = false; };
  }, [workerId, shiftId]);

  const selectPlanningOption = useCallback(
    async (option: PlanningProjectOption, piece: PieceTask | null) => {
      const matchingEntry =
        option.entries.find((e) => e.piece_task_id === piece?.id) ?? option.entries[0] ?? null;

      const previousPieceId = pieceTask?.id ?? null;

      setProject(option.project);
      setPieceTask(piece);
      setPlanningId(matchingEntry?.id ?? null);
      setOfWorkPackageId(matchingEntry?.of_work_package_id ?? null);

      if (matchingEntry?.of_work_package_id) {
        const wp = await fetchOfWorkPackageById(matchingEntry.of_work_package_id);
        setOfWorkPackageInterface(wp?.interface_type ?? null);
      } else {
        setOfWorkPackageInterface(null);
      }

      if (matchingEntry?.machine_id) {
        setMachine(await fetchMachineById(matchingEntry.machine_id));
      } else {
        setMachine(null);
      }

      if (piece) {
        await switchShiftPiece(shiftId, workerId, previousPieceId, piece.id, piece.project_id);
      }
    },
    [pieceTask, shiftId, workerId],
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
          ofWorkPackageId: ofWpRef.current,
          sessionType: "production",
          taskTypeId: taskType.id,
          stopReasonId: null,
        });
        setActiveSessions(await fetchOpenSessionsForWorker(workerId));
        // ✅ recalcul du temps consommé (une session vient de démarrer/terminer)
        await refreshConsumedSeconds();
        return { ok: true };
      } catch (err) {
        if (err instanceof MaxActiveEventsError) return { ok: false, reason: "max_active" };
        throw err;
      }
    },
    [workerId, shiftId, machine, project, pieceTask, planningId, refreshConsumedSeconds],
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
          ofWorkPackageId: ofWpRef.current,
          sessionType: "downtime",
          taskTypeId: null,
          stopReasonId: reason.id,
          note,
        });
        setActiveSessions(await fetchOpenSessionsForWorker(workerId));
        // ✅ recalcul du temps consommé
        await refreshConsumedSeconds();
        return { ok: true };
      } catch (err) {
        if (err instanceof MaxActiveEventsError) return { ok: false, reason: "max_active" };
        throw err;
      }
    },
    [workerId, shiftId, machine, project, pieceTask, planningId, refreshConsumedSeconds],
  );

  const completePiece = useCallback(async () => {
    if (!pieceTask) return;
    await markPieceTaskComplete(pieceTask.id, workerId, shiftId, ofWpRef.current);
    setPieceTask(null);
    setOfWorkPackageId(null);
    setOfWorkPackageInterface(null);
    setConsumedSeconds(0);  // ✅ reset
    setActiveSessions(await fetchOpenSessionsForWorker(workerId));
  }, [pieceTask, workerId, shiftId]);

  const pausePiece = useCallback(async () => {
    if (!pieceTask) return;
    await pauseWorkOnPiece(pieceTask.id, workerId);
    setActiveSessions(await fetchOpenSessionsForWorker(workerId));
    // ✅ recalcul après pause (sessions fermées)
    await refreshConsumedSeconds();
  }, [pieceTask, workerId, refreshConsumedSeconds]);

  const changePhase = useCallback(
    async (delta: number) => {
      if (!pieceTask) return;
      const current = Number.parseInt(pieceTask.phase ?? "1", 10) || 1;
      const next = Math.min(MAX_PHASE, Math.max(1, current + delta));
      if (next === current) return;
      setPieceTask((previous) => (previous ? { ...previous, phase: String(next) } : previous));
      await updatePiecePhase(pieceTask.id, next);
    },
    [pieceTask],
  );

  const refreshActiveSessions = useCallback(async () => {
    setActiveSessions(await fetchOpenSessionsForWorker(workerId));
  }, [workerId]);

  return {
    machine,
    project,
    pieceTask,
    planningId,
    ofWorkPackageId,
    ofWorkPackageInterface,
    consumedSeconds,  // ✅ NEW
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
    refreshConsumedSeconds,  // ✅ NEW
  };
}