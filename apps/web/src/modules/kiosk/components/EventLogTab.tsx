import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit3, PlayCircle } from "lucide-react";
import type { WorkSession, TaskType, StopReason } from "../../../shared/types/database";

interface EventLogTabProps {
  /** أحداث اليوم كاملة (مفتوحة ومغلقة) — سطر واحد ثابت لكل حدث */
  sessions: WorkSession[];
  taskTypes: TaskType[];
  stopReasons: StopReason[];
  onOpenSession?: (session: WorkSession) => void;
}

function resolveEventName(session: WorkSession, taskTypes: TaskType[], stopReasons: StopReason[]): string {
  if (session.session_type === "production") {
    return taskTypes.find((t) => t.id === session.task_type_id)?.name ?? "—";
  }
  return stopReasons.find((r) => r.id === session.stop_reason_id)?.name ?? "—";
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** عداد حي: يعمل كل ثانية طالما الحدث مفتوح (ended_at فارغ)، ويتجمّد على
 * المدة النهائية بمجرد إيقاف الحدث — بلا أي سطر إضافي يُضاف عند التوقف. */
function EventElapsedTime({ session }: { session: WorkSession }) {
  const isOpen = session.ended_at === null;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const elapsed = isOpen
    ? Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000))
    : (session.duration_seconds ?? 0);

  // إعادة الحساب عند كل tick عبر الاعتماد الضمني على المتغيّر أعلاه
  void tick;

  return (
    <span
      dir="ltr"
      className={`shrink-0 text-xs font-bold tabular-nums ${isOpen ? "text-emerald-600" : "text-slate-400"}`}
    >
      {formatElapsed(elapsed)}
    </span>
  );
}

/** سجل الأحداث: قابل للنقر على أي حدث (مفتوح أو مغلق) لفتحه للتصحيح/التدقيق
 * — البند 12. الأحداث الملغاة (voided) لا تظهر هنا؛ تبقى مرئية فقط في سجل
 * التدقيق الإداري حفاظاً على وضوح واجهة العامل. */
export function EventLogTab({ sessions, taskTypes, stopReasons, onOpenSession }: EventLogTabProps) {
  const { t } = useTranslation();
  const visibleSessions = sessions
    .filter((s) => !s.voided_at)
    .slice()
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  if (visibleSessions.length === 0) {
    return <div className="p-4 text-sm text-slate-400">{t("kiosk.noEvents")}</div>;
  }

  return (
    <ul className="flex flex-col gap-2 overflow-y-auto p-3">
      {visibleSessions.map((session) => {
        const isEditable = Boolean(onOpenSession);
        const isOpen = session.ended_at === null;
        return (
          <li
            key={session.id}
            onClick={isEditable ? () => onOpenSession!(session) : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              isOpen ? "bg-emerald-50" : "bg-slate-50"
            } ${isEditable ? "cursor-pointer transition hover:opacity-80" : ""}`}
          >
            <span className="flex items-center gap-2 text-slate-700">
              {isOpen && <PlayCircle size={13} className="shrink-0 text-emerald-600" />}
              {resolveEventName(session, taskTypes, stopReasons)}
              {isEditable && <Edit3 size={12} className="text-slate-400" />}
            </span>
            <EventElapsedTime session={session} />
          </li>
        );
      })}
    </ul>
  );
}
