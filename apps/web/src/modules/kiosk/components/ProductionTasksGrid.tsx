import { useTranslation } from "react-i18next";
import { useTaskTypes } from "../hooks/useTaskTypes";
import { TaskCard } from "./TaskCard";
import type { ToggleResult } from "../hooks/useActiveTask";
import type { WorkSession, TaskType } from "../../../shared/types/database";
import type { PieceOperationEstimate } from "../api/kioskApi";
import { getStageInterface } from "../../nomenclature/lib/costingConstants";

interface ProductionTasksGridProps {
  activeSessions: WorkSession[];
  /** Opérations estimées de la pièce courante (pour afficher le temps). */
  pieceOperations?: PieceOperationEstimate[];
  onToggle: (taskType: TaskType) => Promise<ToggleResult>;
  onMaxActiveEvents: () => void;
  onCorrectSession?: (session: WorkSession) => void;
}

/**
 * Colonne bleue : cartes des tâches de production.
 * Un badge d'estimation (minutes) est affiché si une opération de même étape
 * est trouvée dans `pieceOperations`.
 *
 * Correspondance task_type ↔ stage : par nom normalisé (insensible à la casse,
 * accents supprimés). Cette approche évite de coupler le Kiosk à un mapping
 * figé, tout en restant prévisible côté admin.
 */
export function ProductionTasksGrid({
  activeSessions,
  pieceOperations = [],
  onToggle,
  onMaxActiveEvents,
  onCorrectSession,
}: ProductionTasksGridProps) {
  const { t } = useTranslation();
  const { taskTypes, isLoading } = useTaskTypes();

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-400">{t("kiosk.loadingTasks")}</div>;
  }

  if (taskTypes.length === 0) {
    return <div className="p-4 text-sm text-slate-400">{t("kiosk.noTaskTypes")}</div>;
  }

  /** Renvoie l'estimation (en minutes) pour un task_type donné, si trouvée. */
  function estimateForTaskType(tt: TaskType): number | null {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const target = norm(tt.name);

    // 1) Match exact par label (stage), sinon par label de l'opération
    const op = pieceOperations.find((o) => {
      const stageName = norm(String(o.stage));
      const label = norm(String(o.label ?? ""));
      return stageName === target || label === target;
    });

    if (op && op.estimated_hours > 0) {
      return Math.round(op.estimated_hours * 60);
    }
    return null;
  }

  async function handleClick(taskType: TaskType) {
    const result = await onToggle(taskType);
    if (!result.ok && result.reason === "max_active") onMaxActiveEvents();
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <h3 className="px-1 text-sm font-bold text-blue-700">{t("kiosk.productionTasks")}</h3>
      <div className="grid grid-cols-2 gap-3">
        {taskTypes.map((taskType) => {
          const activeSession = activeSessions.find((s) => s.task_type_id === taskType.id);
          const est = estimateForTaskType(taskType);
          return (
            <TaskCard
              key={taskType.id}
              label={taskType.name}
              color={taskType.color}
              isActive={Boolean(activeSession)}
              estimateMinutes={est}
              onClick={() => void handleClick(taskType)}
              onDoubleClick={
                activeSession && onCorrectSession
                  ? () => onCorrectSession(activeSession)
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}