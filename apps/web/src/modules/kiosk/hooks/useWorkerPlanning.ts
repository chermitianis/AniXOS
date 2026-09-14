import { useEffect, useState, useCallback } from "react";
import { fetchWorkerPlanningQueue, fetchProjectById, fetchPiecesForProject } from "../api/kioskApi";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { connectivityMonitor } from "../../../lib/connectivity";
import type { PlanningEntry, Project, PieceTask } from "../../../shared/types/database";

export interface PlanningProjectOption {
  project: Project;
  entries: PlanningEntry[]; // كل مدخلات المخطط الخاصة بهذا المشروع لهذا العامل، مرتبة زمنياً
}

export function useWorkerPlanning(workerId: string) {
  const [queue, setQueue] = useState<PlanningEntry[]>([]);
  const [projectOptions, setProjectOptions] = useState<PlanningProjectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const entries = await fetchWorkerPlanningQueue(workerId);
    setQueue(entries);

    // تجميع المدخلات حسب المشروع، بالحفاظ على ترتيب أول ظهور (= الأقرب زمنياً)
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

  // بث حي: أي تغيير في ترتيب/تخصيص المخطط لهذا العامل يظهر فوراً في الكشك
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

  /** قطع مشروع معيّن: القطع المخطَّطة أولاً ثم البقية، والمكتملة في مجموعة
   * منفصلة تماماً (البند 7: "القطع المكتملة في قسم منفصل") */
  async function loadPiecesForOption(
    option: PlanningProjectOption
  ): Promise<{ activePieces: PieceTask[]; completedPieces: PieceTask[] }> {
    const allPieces = await fetchPiecesForProject(option.project.id);
    const plannedPieceIds = new Set(option.entries.map((e) => e.piece_task_id).filter(Boolean));

    const notCompleted = allPieces.filter((p) => p.status !== "completed");
    const planned = notCompleted.filter((p) => plannedPieceIds.has(p.id));
    const others = notCompleted.filter((p) => !plannedPieceIds.has(p.id));

    const completedPieces = allPieces
      .filter((p) => p.status === "completed")
      .sort((a, b) => a.sequence_order - b.sequence_order);

    return { activePieces: [...planned, ...others], completedPieces };
  }

  return { queue, projectOptions, isLoading, reload, loadPiecesForOption };
}
