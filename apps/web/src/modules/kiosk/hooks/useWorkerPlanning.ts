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

  /** قطع مشروع معيّن: القطع المخطَّطة أولاً (بالترتيب المحدَّد من المشرف في
   *  المخطط عبر sequence_order)، ثم بقية القطع. المكتملة في مجموعة منفصلة. */
  async function loadPiecesForOption(
    option: PlanningProjectOption
  ): Promise<{ activePieces: PieceTask[]; completedPieces: PieceTask[] }> {
    const allPieces = await fetchPiecesForProject(option.project.id);
    const plannedPieceIds = new Set(option.entries.map((e) => e.piece_task_id).filter(Boolean));

    // ✅ NEW : Map { piece_task_id → sequence_order } depuis le planning
    // L'admin a défini l'ordre des cartes dans chaque cellule ;
    // la 1ère carte de la liste de l'opérateur doit correspondre à celle
    // ayant le sequence_order le plus petit.
    const plannedPieceOrder = new Map<string, number>();
    for (const entry of option.entries) {
      if (!entry.piece_task_id) continue;
      const order = entry.sequence_order ?? 1;
      const existing = plannedPieceOrder.get(entry.piece_task_id);
      if (existing === undefined || order < existing) {
        plannedPieceOrder.set(entry.piece_task_id, order);
      }
    }

    const notCompleted = allPieces.filter((p) => p.status !== "completed");
    // ✅ NEW : trier les pièces planifiées selon sequence_order du planning
    const planned = notCompleted
      .filter((p) => plannedPieceIds.has(p.id))
      .sort((a, b) => {
        const oa = plannedPieceOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const ob = plannedPieceOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return oa - ob;
      });
    const others = notCompleted.filter((p) => !plannedPieceIds.has(p.id));

    const completedPieces = allPieces
      .filter((p) => p.status === "completed")
      .sort((a, b) => a.sequence_order - b.sequence_order);

    return { activePieces: [...planned, ...others], completedPieces };
  }

  return { queue, projectOptions, isLoading, reload, loadPiecesForOption };
}