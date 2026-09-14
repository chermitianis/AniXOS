import { useTranslation } from "react-i18next";
import { useTaskTypes } from "../hooks/useTaskTypes";
import { TaskCard } from "./TaskCard";
import type { ToggleResult } from "../hooks/useActiveTask";
import type { WorkSession, TaskType } from "../../../shared/types/database";

interface ProductionTasksGridProps {
  /** حتى 3 أحداث نشطة بالتوازي للعامل — وليس حدثاً واحداً */
  activeSessions: WorkSession[];
  onToggle: (taskType: TaskType) => Promise<ToggleResult>;
  onMaxActiveEvents: () => void;
  onCorrectSession?: (session: WorkSession) => void;
}

/**
 * العمود الأزرق: بطاقات المهام الإنتاجية. القائمة بالكامل ديناميكية —
 * تُقرأ من جدول task_types الخاص بالشركة، وليست ثابتة في الكود إطلاقاً.
 * النقرة الأولى على بطاقة تبدأ الحدث، والنقرة الثانية على نفس البطاقة
 * توقفه (toggle) — حتى 3 بطاقات نشطة بالتوازي للعامل الواحد كحد أقصى.
 */
export function ProductionTasksGrid({ activeSessions, onToggle, onMaxActiveEvents, onCorrectSession }: ProductionTasksGridProps) {
  const { t } = useTranslation();
  const { taskTypes, isLoading } = useTaskTypes();

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-400">{t("kiosk.loadingTasks")}</div>;
  }

  if (taskTypes.length === 0) {
    return <div className="p-4 text-sm text-slate-400">{t("kiosk.noTaskTypes")}</div>;
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
          return (
            <TaskCard
              key={taskType.id}
              label={taskType.name}
              color={taskType.color}
              isActive={Boolean(activeSession)}
              onClick={() => void handleClick(taskType)}
              onDoubleClick={activeSession && onCorrectSession ? () => onCorrectSession(activeSession) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
