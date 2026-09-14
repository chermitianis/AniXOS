import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProjectsReportTab } from "./ProjectsReportTab";
import { WorkerReportTab } from "./WorkerReportTab";
import { MachineReportTab } from "./MachineReportTab";

type ReportsTab = "projects" | "workers" | "machines";

export function ReportsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ReportsTab>("projects");

  const tabs: { key: ReportsTab; label: string }[] = [
    { key: "projects", label: t("setup.reportsByProject") },
    { key: "workers", label: t("setup.reportsByWorker") },
    { key: "machines", label: t("setup.reportsByMachine") },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold ${
              activeTab === tab.key ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "projects" && <ProjectsReportTab />}
      {activeTab === "workers" && <WorkerReportTab />}
      {activeTab === "machines" && <MachineReportTab />}
    </div>
  );
}
