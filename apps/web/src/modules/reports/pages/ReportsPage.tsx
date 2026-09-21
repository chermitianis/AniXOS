import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Briefcase, HardHat, Cog, Wallet } from "lucide-react";
import { PeriodSelector } from "../components/PeriodSelector";
import { computeDateRange, type DateRange } from "../types";
import { OverviewTab } from "./OverviewTab";
import { ProjectsReportTab } from "./ProjectsReportTab";
import { WorkersReportTab } from "./WorkersReportTab";
import { MachinesReportTab } from "./MachinesReportTab";
import { FinanceReportTab } from "./FinanceReportTab";

type ReportsTab = "overview" | "projects" | "workers" | "machines" | "finance";

export function ReportsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ReportsTab>("overview");
  const [dateRange, setDateRange] = useState<DateRange>(() => computeDateRange("month_current"));

  const tabs = useMemo(
    () => [
      { key: "overview" as const, labelKey: "reports.tabs.overview", icon: BarChart3 },
      { key: "projects" as const, labelKey: "reports.tabs.projects", icon: Briefcase },
      { key: "workers" as const, labelKey: "reports.tabs.workers", icon: HardHat },
      { key: "machines" as const, labelKey: "reports.tabs.machines", icon: Cog },
      { key: "finance" as const, labelKey: "reports.tabs.finance", icon: Wallet },
    ],
    []
  );

  return (
    <div>
      {/* En-tête : titre + sélecteur de période */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-base font-extrabold tracking-tight text-slate-800 sm:text-lg">
            {t("reports.title")}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">{t("reports.subtitle")}</p>
        </div>
        <div className="shrink-0">
          <PeriodSelector value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Onglets — scroll horizontal sur mobile */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${
                isActive
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={15} />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Contenu selon l'onglet */}
      {activeTab === "overview" && <OverviewTab dateRange={dateRange} />}
      {activeTab === "projects" && <ProjectsReportTab dateRange={dateRange} />}
      {activeTab === "workers" && <WorkersReportTab dateRange={dateRange} />}
      {activeTab === "machines" && <MachinesReportTab dateRange={dateRange} />}
      {activeTab === "finance" && <FinanceReportTab dateRange={dateRange} />}
    </div>
  );
}