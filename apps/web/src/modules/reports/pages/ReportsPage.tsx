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
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* HEADER                                                       */}
      {/* ============================================================ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1
            className="truncate text-2xl font-black tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {t("reports.title")}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("reports.subtitle")}
          </p>
        </div>
        <div className="shrink-0">
          <PeriodSelector value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* ============================================================ */}
      {/* TABS                                                         */}
      {/* ============================================================ */}
      <div
        className="flex gap-1 overflow-x-auto rounded-xl border p-1"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:px-4"
              style={
                isActive
                  ? {
                      backgroundColor: "var(--brand-orange)",
                      color: "#ffffff",
                      boxShadow: "var(--shadow-sm)",
                    }
                  : {
                      color: "var(--text-secondary)",
                    }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--bg-muted)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              <Icon size={15} />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* CONTENT                                                      */}
      {/* ============================================================ */}
      {activeTab === "overview" && <OverviewTab dateRange={dateRange} />}
      {activeTab === "projects" && <ProjectsReportTab dateRange={dateRange} />}
      {activeTab === "workers" && <WorkersReportTab dateRange={dateRange} />}
      {activeTab === "machines" && <MachinesReportTab dateRange={dateRange} />}
      {activeTab === "finance" && <FinanceReportTab dateRange={dateRange} />}
    </div>
  );
}