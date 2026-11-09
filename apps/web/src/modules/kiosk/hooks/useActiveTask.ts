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
  fetchConsumedSecondsForPiece,
} from "../api/kioskApi";
import type { PlanningProjectOption } from "./useWorkerPlanning";
import { useWorkerSession } from "../../../auth/WorkerSessionContext";
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
const CONSUMED_REFRESH_INTERVAL_MS = 30_000;

interface ActiveTaskState {
  machine: Machine | null;
  project: Project | null;
  pieceTask: PieceTask | null;
  planningId: string | null;
  ofWorkPackageId: string | null;
  ofWorkPackageInterface: WpInterface | null;
  consumedSeconds: number;
  activeSessions: WorkSession[];
  isLoadingContext: boolean;
  setMachine: (machine: Machine | null) => void;
  setProject: (project: Project | null) => void;
  setPieceTask: (pieceTask: PieceTask | null) => void;
  selectPlanningOption: (
    option: PlanningProjectOption,
    piece: PieceTask | null,
    planningId?: string | null,
    ofWorkPackageId?: string | null
  ) => Promise<void>;
  toggleProductionTask: (taskType: TaskType) => Promise<ToggleResult>;
  toggleStopReason: (reason: StopReason, note?: string) => Promise<ToggleResult>;
  completePiece: () => Promise<void>;
  pausePiece: () => Promise<void>;
  changePhase: (delta: number) => Promise<void>;
  refreshActiveSessions: () => Promise<void>;
  refreshConsumedSeconds: () => Promise<void>;
}

export function useActiveTask(workerId: string, shiftId: string | null): ActiveTaskState {
  const { updateSessionStartedAt } = useWorkerSession();

  const [machine, setMachine] = useState<Machine | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [pieceTask, setPieceTask] = useState<PieceTask | null>(null);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [ofWorkPackageId, setOfWorkPackageId] = useState<string | null>(null);
  const [ofWorkPackageInterface, setOfWorkPackageInterface] = useState<WpInterface | null>(null);
  const [consumedSeconds, setConsumedSeconds] = useState<number>(0);
  const [activeSessions, setActiveSessions] = useState<WorkSession[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  const ofWpRef = useRef<string | null>(null);
  useEffect(() => { ofWpRef.current = ofWorkPackageId; }, [ofWorkPackageId]);

  const pieceIdRef = useRef<string | null>(null);
  useEffect(() => { pieceIdRef.current = pieceTask?.id ?? null; }, [pieceTask?.id]);

  const refreshConsumedSeconds = useCallback(async () => {
    const pid = pieceIdRef.current;
    if (!pid) {
      setConsumedSeconds(0);
      return;
    }
    const seconds = await fetchConsumedSecondsForPiece(pid);
    setConsumedSeconds(seconds);
  }, []);

  useEffect(() => {
    void refreshConsumedSeconds();
  }, [pieceTask?.id, refreshConsumedSeconds]);

  useEffect(() => {
    if (!pieceTask?.id) return;
    const interval = setInterval(() => {
      void refreshConsumedSeconds();
    }, CONSUMED_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pieceTask?.id, refreshConsumedSeconds]);

  // ✅ تحميل السياق الأولي مع تصفية الجلسات على الجهاز الحالي فقط
  useEffect(() => {
    let isMounted = true;

    async function loadInitialContext() {
      setIsLoadingContext(true);

      const [planning, allOpenSessions] = await Promise.all([
        fetchTodayPlanningForWorker(workerId),
        fetchOpenSessionsForWorker(workerId),
      ]);

      // ✅ تصفية الجلسات على الجهاز الحالي فقط
      const currentDeviceId = localStorage.getItem("anixos_device_id");
      const openSessions = currentDeviceId
        ? allOpenSessions.filter((s) => s.device_id === currentDeviceId)
        : [];

      if (isMounted) setActiveSessions(openSessions);

      const openPieceId = openSessions.find((s) => s.piece_task_id)?.piece_task_id ?? null;

      if (openPieceId && isMounted) {
        // ✅ هناك جلسة مفتوحة على هذا الجهاز -> استئنافها
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
        // ✅ لا توجد جلسة مفتوحة على هذا الجهاز -> عرض أول قطعة من المخطط (إن وجدت)
        // لكن، لا نُعيّنها كـ "pieceTask" (الواجهة تبدأ فارغة)
        // سنتركها للمستخدم ليختار.
        setPlanningId(planning.id);
        setOfWorkPackageId(planning.of_work_package_id ?? null);
        if (planning.of_work_package_id) {
          const wp = await fetchOfWorkPackageById(planning.of_work_package_id);
          setOfWorkPackageInterface(wp?.interface_type ?? null);
        } else {
          setOfWorkPackageInterface(null);
        }
        // لا نُعيّن pieceTask (الواجهة تبدأ فارغة)
      }

      if (isMounted) setIsLoadingContext(false);
    }

    void loadInitialContext();
    return () => { isMounted = false; };
  }, [workerId, shiftId]);

  const selectPlanningOption = useCallback(
    async (
      option: PlanningProjectOption,
      piece: PieceTask | null,
      overridePlanningId?: string | null,
      overrideOfWorkPackageId?: string | null
    ) => {
      const matchingEntry =
        option.entries.find((e) => e.piece_task_id === piece?.id) ?? option.entries[0] ?? null;

      const targetPlanningId = overridePlanningId ?? matchingEntry?.id ?? null;
      const targetOfWpId = overrideOfWorkPackageId ?? matchingEntry?.of_work_package_id ?? null;

      const previousPieceId = pieceTask?.id ?? null;

      setProject(option.project);
      setPieceTask(piece);
      setPlanningId(targetPlanningId);
      setOfWorkPackageId(targetOfWpId);

      if (targetOfWpId) {
        const wp = await fetchOfWorkPackageById(targetOfWpId);
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

        // ✅ تحديث session_started_at إلى وقت الجلسة الجديدة
        const openSessions = await fetchOpenSessionsForWorker(workerId);
        const currentDeviceId = localStorage.getItem("anixos_device_id");
        const session = openSessions.find(
          (s) => s.device_id === currentDeviceId && s.piece_task_id === piece.id
        );
        if (session) {
          updateSessionStartedAt(session.started_at);
        }
      }
    },
    [pieceTask, shiftId, workerId, updateSessionStartedAt],
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
        await refreshConsumedSeconds();

        const openSessions = await fetchOpenSessionsForWorker(workerId);
        const currentDeviceId = localStorage.getItem("anixos_device_id");
        const currentSession = openSessions.find(
          (s) => s.device_id === currentDeviceId && s.piece_task_id === pieceTask?.id
        );
        if (currentSession) {
          updateSessionStartedAt(currentSession.started_at);
        }

        return { ok: true };
      } catch (err) {
        if (err instanceof MaxActiveEventsError) return { ok: false, reason: "max_active" };
        throw err;
      }
    },
    [workerId, shiftId, machine, project, pieceTask, planningId, refreshConsumedSeconds, updateSessionStartedAt],
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
    setConsumedSeconds(0);

    setActiveSessions(await fetchOpenSessionsForWorker(workerId));
  }, [pieceTask, workerId, shiftId]);

  const pausePiece = useCallback(async () => {
    if (!pieceTask) return;
    await pauseWorkOnPiece(pieceTask.id, workerId);
    setActiveSessions(await fetchOpenSessionsForWorker(workerId));
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
    consumedSeconds,
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
    refreshConsumedSeconds,
  };
}