import { useTranslation } from "react-i18next";
import type { SessionSummary } from "../hooks/useSessionSummary";

interface SummaryTabProps {
  summary: SessionSummary;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function SummaryTab({ summary }: SummaryTabProps) {
  const { t } = useTranslation();

  const stats = [
    { label: t("kiosk.productiveTime"), value: formatDuration(summary.productiveSeconds), color: "text-blue-600" },
    { label: t("kiosk.downtime"), value: formatDuration(summary.downtimeSeconds), color: "text-orange-600" },
    { label: t("kiosk.tasksCount"), value: String(summary.tasksCount), color: "text-slate-700" },
    { label: t("kiosk.stopsCount"), value: String(summary.stopsCount), color: "text-slate-700" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 p-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg bg-slate-50 p-3 text-center">
          <div className={`text-xl font-bold ${stat.color}`} dir="ltr">
            {stat.value}
          </div>
          <div className="mt-1 text-xs text-slate-500">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
