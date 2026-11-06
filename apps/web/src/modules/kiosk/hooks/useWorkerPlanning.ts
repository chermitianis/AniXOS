import { useEffect, useState, useCallback } from "react";
import { fetchWorkerPlanningQueue, fetchProjectById, fetchPiecesForProject } from "../api/kioskApi";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { connectivityMonitor } from "../../../lib/connectivity";
import { getLocalDeviceId } from "../../../lib/deviceContext"; // ✅ استيراد device_id
import type { PlanningEntry, Project, PieceTask } from "../../../shared/types/database";

export interface PlanningProjectOption {
  project: Project;
  entries: PlanningEntry[];
}

// ✅ دالة لجلب القطع المشغولة حالياً على أجهزة أخرى
async function fetchBusyPiecesOnOtherDevices(
  companyId: string,
  currentDeviceId: string | null
): Promise<Set<string>> {
  const busyPieceIds = new Set<string>();

  if (!connectivityMonitor.getStatus() || !companyId) return busyPieceIds;

  const { data, error } = await supabase
    .from("work_sessions")
    .select("piece_task_id, device_id")
    .eq("company_id", companyId)
    .is("ended_at", null)
    .is("voided_at", null)
    .not("piece_task_id", "is", null);

  if (error || !data) return busyPieceIds;

  for (const session of data) {
    if (!session.piece_task_id) continue;
    // القطعة مشغولة إذا كانت الجلسة مفتوحة على جهاز مختلف
    if (session.device_id && session.device_id !== currentDeviceId) {
      busyPieceIds.add(session.piece_task_id);
    }
  }

  return busyPieceIds;
}

export function useWorkerPlanning(workerId: string) {
  const [queue, setQueue] = useState<PlanningEntry[]>([]);
  const [projectOptions, setProjectOptions] = useState<PlanningProjectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const entries = await fetchWorkerPlanningQueue(workerId);
    setQueue(entries);

    const orderedProjectIds: string[] = [];
    const entriesByProject = new Map<string, PlanningEntry[]>();

    for (const entry of entries) {
      if (!entry.project_id) continue;
      if (!entriesByProject.has(entry.project_id)) {
        entriesByProject.set(entry.project_id, []);
        orderedProjectIds.push(entry.project_id);
      }
      entriesByProject.get(entry.project_id)!.push(entry);
    }

    const options: PlanningProjectOption[] = [];
    for (const projectId of orderedProjectIds) {
      const project = await fetchProjectById(projectId);
      if (project) {
        options.push({ project, entries: entriesByProject.get(projectId)! });
      }
    }

    setProjectOptions(options);
    setIsLoading(false);
  }, [workerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const channel = createSafeChannel(`planning-${workerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planning", filter: `worker_id=eq.${workerId}` },
        () => void reload()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workerId, reload]);

  useEffect(() => {
    return connectivityMonitor.subscribe((isOnline) => {
      if (isOnline) void reload();
    });
  }, [reload]);

  /** قطع مشروع معيّن: القطع المخطَّطة أولاً، ثم بقية القطع.
   *  القطع المنتهية والمشغولة على أجهزة أخرى تُستبعد تماماً. */
  async function loadPiecesForOption(
    option: PlanningProjectOption
  ): Promise<{ activePieces: PieceTask[]; completedPieces: PieceTask[] }> {
    const allPieces = await fetchPiecesForProject(option.project.id);
    const plannedPieceIds = new Set(option.entries.map((e) => e.piece_task_id).filter(Boolean));

    const plannedPieceOrder = new Map<string, number>();
    for (const entry of option.entries) {
      if (!entry.piece_task_id) continue;
      const order = entry.sequence_order ?? 1;
      const existing = plannedPieceOrder.get(entry.piece_task_id);
      if (existing === undefined || order < existing) {
        plannedPieceOrder.set(entry.piece_task_id, order);
      }
    }

    // ✅ جلب القطع المشغولة على أجهزة أخرى
    const currentDeviceId = getLocalDeviceId();
    const companyId = option.project.company_id;
    const busyPieceIds = await fetchBusyPiecesOnOtherDevices(companyId, currentDeviceId);

    // ✅ استبعاد القطع المنتهية والقطع المشغولة على أجهزة أخرى
    const notCompleted = allPieces.filter(
      (p) => p.status !== "completed" && !busyPieceIds.has(p.id)
    );

    const planned = notCompleted
      .filter((p) => plannedPieceIds.has(p.id))
      .sort((a, b) => {
        const oa = plannedPieceOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const ob = plannedPieceOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return oa - ob;
      });
    const others = notCompleted.filter((p) => !plannedPieceIds.has(p.id));

    // ✅ القطع المنتهية تظهر فقط في قسم "المكتملة" وليس في القائمة النشطة
    const completedPieces = allPieces
      .filter((p) => p.status === "completed")
      .sort((a, b) => a.sequence_order - b.sequence_order);

    return { activePieces: [...planned, ...others], completedPieces };
  }

  return { queue, projectOptions, isLoading, reload, loadPiecesForOption };
}
