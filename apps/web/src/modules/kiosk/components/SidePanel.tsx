import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { EventLogTab } from "./EventLogTab";
import { SummaryTab } from "./SummaryTab";
import { useSessionSummary } from "../hooks/useSessionSummary";
import { useTaskTypes } from "../hooks/useTaskTypes";
import { useStopReasons } from "../hooks/useStopReasons";
import { fetchWorkerSessionsToday } from "../api/kioskApi";
import type { WorkSession } from "../../../shared/types/database";

interface SidePanelProps {
  workerId: string;
  /** الأحداث المفتوحة حالياً (حتى 3) — المصدر الأحدث دوماً لحالتها الحية */
  activeSessions: WorkSession[];
  /** يتغيّر بعد أي تصحيح/إلغاء حدث (حتى المغلق منها) لإجبار إعادة التحميل */
  refreshSignal?: number;
  onOpenSessionForCorrection?: (session: WorkSession) => void;
}

export function SidePanel({ workerId, activeSessions, refreshSignal, onOpenSessionForCorrection }: SidePanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"log" | "summary">("log");
  const [closedSessionsToday, setClosedSessionsToday] = useState<WorkSession[]>([]);
  const { taskTypes } = useTaskTypes();
  const { stopReasons } = useStopReasons();
  const summary = useSessionSummary(workerId, activeSessions.map((s) => s.id).join(","));

  // تحميل أحداث اليوم المغلقة عند التركيب، وإعادة تحميلها كلما تغيّرت
  // الأحداث النشطة أو وقعت أي عملية تصحيح/إلغاء (refreshSignal)
  useEffect(() => {
    let isMounted = true;
    void fetchWorkerSessionsToday(workerId).then((sessions) => {
      if (isMounted) setClosedSessionsToday(sessions.filter((s) => s.ended_at !== null));
    });
    return () => {
      isMounted = false;
    };
  }, [workerId, activeSessions.length, refreshSignal]);

  // دمج المفتوحة (المصدر الأحدث) مع المغلقة اليوم لعرض سجل كامل بسطر واحد لكل حدث
  const todaySessions = [...activeSessions, ...closedSessionsToday.filter((s) => !activeSessions.some((a) => a.id === s.id))];

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("log")}
          className={`flex-1 py-3 text-sm font-semibold ${
            activeTab === "log" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
          }`}
        >
          {t("kiosk.eventLog")}
        </button>
        <button
          onClick={() => setActiveTab("summary")}
          className={`flex-1 py-3 text-sm font-semibold ${
            activeTab === "summary" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
          }`}
        >
          {t("kiosk.summary")}
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "log" ? (
          <EventLogTab
            sessions={todaySessions}
            taskTypes={taskTypes}
            stopReasons={stopReasons}
            onOpenSession={onOpenSessionForCorrection}
          />
        ) : (
          <SummaryTab summary={summary} />
        )}
      </div>
    </div>
  );
}
