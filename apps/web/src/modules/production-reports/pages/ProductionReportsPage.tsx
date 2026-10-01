import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, FolderKanban, CalendarDays } from "lucide-react";
import { PiecesReportsTab } from "./PiecesReportsTab";
import { ProjectCompletionTab } from "./ProjectCompletionTab";
import { DailyShiftsTab } from "./DailyShiftsTab";

type Tab = "pieces" | "projects" | "daily";

export function ProductionReportsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("pieces");

  const tabs: { key: Tab; labelKey: string; Icon: typeof Boxes }[] = [
    { key: "pieces",   labelKey: "productionReports.tabs.pieces",   Icon: Boxes },
    { key: "projects", labelKey: "productionReports.tabs.projects", Icon: FolderKanban },
    { key: "daily",    labelKey: "productionReports.tabs.daily",    Icon: CalendarDays },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ key, labelKey, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === key
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Icon size={14} />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "pieces" && <PiecesReportsTab />}
      {activeTab === "projects" && <ProjectCompletionTab />}
      {activeTab === "daily" && <DailyShiftsTab />}
    </div>
  );
}