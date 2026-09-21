import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Box, X, Briefcase, TrendingUp, Clock, DollarSign } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { ProjectReportModal } from "../../setup/components/ProjectReportModal";
import { KpiCard } from "../components/KpiCard";
import { EmptyState } from "../components/EmptyState";
import type { Project } from "../../../shared/types/database";
import type { DateRange } from "../types";

interface ProjectsReportTabProps {
  dateRange: DateRange;
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  planned: "setup.draft",
  in_progress: "setup.statusInProgress",
  on_hold: "setup.pieceStatusPending",
  completed: "setup.statusCompleted",
  cancelled: "setup.cancelled",
};

interface ProjectWithStats extends Project {
  actual_production_hours?: number;
  actual_labor_cost?: number;
  net_profit?: number;
  time_variance_percent?: number | null;
  risk_status?: string;
}

interface PieceSearchResult {
  piece_task_id: string;
  piece_name: string;
  project_id: string;
  project_name: string;
  project_code: string | null;
}

export function ProjectsReportTab({ dateRange }: ProjectsReportTabProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [reportProjectId, setReportProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pieceResults, setPieceResults] = useState<PieceSearchResult[]>([]);
  const [isSearchingPieces, setIsSearchingPieces] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // تحميل المشاريع + إحصاءات الفترة
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);

      const [projectsRes, profitabilityRes] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("v_project_profitability").select("*"),
      ]);

      if (!isMounted) return;

      const profMap = new Map<string, ProjectWithStats>();
      for (const p of ((profitabilityRes.data ?? []) as ProjectWithStats[])) {
        profMap.set(p.id, p);
      }

      const merged: ProjectWithStats[] = ((projectsRes.data ?? []) as Project[]).map((p) => {
        const prof = profMap.get(p.id);
        return prof ? { ...p, ...prof } : p;
      });

      setProjects(merged);
      setIsLoading(false);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [dateRange.from, dateRange.to]);

  // بحث القطع
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setPieceResults([]);
      return;
    }
    setIsSearchingPieces(true);
    const timeoutId = setTimeout(async () => {
      const { data } = await supabase
        .from("pieces_tasks")
        .select("id, name, project_id, projects(name, code)")
        .ilike("name", `%${query}%`)
        .limit(15);

      const rows = ((data ?? []) as Record<string, unknown>[])
        .filter((row) => row.project_id)
        .map((row) => ({
          piece_task_id: row.id as string,
          piece_name: row.name as string,
          project_id: row.project_id as string,
          project_name: (row.projects as { name?: string } | null)?.name ?? "—",
          project_code: (row.projects as { code?: string } | null)?.code ?? null,
        }));
      setPieceResults(rows);
      setIsSearchingPieces(false);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(query) || (p.code ?? "").toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  const hasActiveSearch = searchQuery.trim().length > 0;

  // KPIs
  const kpis = useMemo(() => {
    const active = projects.filter((p) => p.status !== "completed" && !p.is_archived).length;
    const completed = projects.filter((p) => p.status === "completed").length;
    const totalHours = projects.reduce((sum, p) => sum + (p.actual_production_hours ?? 0), 0);
    const totalProfit = projects.reduce((sum, p) => sum + (p.net_profit ?? 0), 0);
    return { active, completed, totalHours, totalProfit };
  }, [projects]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Briefcase}
          iconBg="bg-indigo-100 text-indigo-600"
          label={t("reports.kpi.activeProjects")}
          value={kpis.active}
        />
        <KpiCard
          icon={Clock}
          iconBg="bg-blue-100 text-blue-600"
          label={t("reports.kpi.completedProjects")}
          value={kpis.completed}
        />
        <KpiCard
          icon={TrendingUp}
          iconBg="bg-emerald-100 text-emerald-600"
          label={t("setup.actualHours")}
          value={`${kpis.totalHours.toFixed(1)} ${t("setup.hoursShort")}`}
        />
        <KpiCard
          icon={DollarSign}
          iconBg={kpis.totalProfit >= 0 ? "bg-violet-100 text-violet-600" : "bg-red-100 text-red-600"}
          label={t("setup.netProfit")}
          value={kpis.totalProfit.toFixed(0)}
          subtitle={t("reports.currencyTND")}
        />
      </div>

      {/* شريط البحث */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("setup.searchProjectsPiecesPlaceholder")}
            className="w-full rounded-lg border border-slate-300 py-2.5 pe-10 ps-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          {hasActiveSearch && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              aria-label={t("common.close")}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {hasActiveSearch && (isSearchingPieces || pieceResults.length > 0) && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t("setup.searchResultsPieces")}</p>
            {isSearchingPieces ? (
              <p className="text-sm text-slate-400">{t("setup.loadingSimple")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pieceResults.map((piece) => (
                  <li key={piece.piece_task_id}>
                    <button
                      onClick={() => setReportProjectId(piece.project_id)}
                      className="flex w-full items-center gap-2.5 rounded-lg bg-indigo-50/60 px-3 py-2 text-start text-sm transition hover:bg-indigo-100/70"
                    >
                      <Box size={15} className="shrink-0 text-indigo-500" />
                      <span className="font-semibold text-slate-700">{piece.piece_name}</span>
                      <span className="text-xs text-slate-400">
                        — {piece.project_name} {piece.project_code ? `(${piece.project_code})` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* جدول المشاريع */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">
          {t("reports.tabs.projects")} ({filteredProjects.length})
        </h3>

        {filteredProjects.length === 0 ? (
          <EmptyState icon={Briefcase} message={hasActiveSearch ? t("setup.noSearchResults") : t("setup.noDataYet")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 text-start">{t("setup.projectName")}</th>
                  <th className="px-3 py-2.5 text-start">{t("setup.status")}</th>
                  <th className="px-3 py-2.5 text-left">{t("setup.actualHours")}</th>
                  <th className="px-3 py-2.5 text-left">{t("setup.quotedPrice")}</th>
                  <th className="px-3 py-2.5 text-left">{t("setup.cost")}</th>
                  <th className="px-3 py-2.5 text-left">{t("setup.netProfit")}</th>
                  <th className="px-3 py-2.5 text-start">{t("reports.timeVariance")}</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => {
                  const profit = p.net_profit ?? 0;
                  const variance = p.time_variance_percent;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-start">
                        <div className="font-semibold text-slate-700">{p.name}</div>
                        <div className="text-xs text-slate-400" dir="ltr">{p.code}</div>
                      </td>
                      <td className="px-3 py-2.5 text-start">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          p.status === "completed" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"
                        }`}>
                          {t(STATUS_LABEL_KEYS[p.status] ?? p.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-600" dir="ltr">
                        {(p.actual_production_hours ?? 0).toFixed(1)} h
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-600" dir="ltr">
                        {(p.quoted_price ?? 0).toFixed(0)}
                      </td>
                      <td className="px-3 py-2.5 text-left text-slate-600" dir="ltr">
                        {(p.actual_labor_cost ?? 0).toFixed(0)}
                      </td>
                      <td className={`px-3 py-2.5 text-left font-bold ${profit >= 0 ? "text-emerald-600" : "text-red-500"}`} dir="ltr">
                        {profit.toFixed(0)}
                      </td>
                      <td className="px-3 py-2.5 text-start">
                        {variance !== null && variance !== undefined ? (
                          <span className={`text-xs font-bold ${variance > 15 ? "text-red-500" : variance > 0 ? "text-amber-600" : "text-emerald-600"}`} dir="ltr">
                            {variance > 0 ? "+" : ""}{variance.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-start">
                        <button
                          onClick={() => setReportProjectId(p.id)}
                          className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                        >
                          {t("setup.viewReport")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reportProjectId && <ProjectReportModal projectId={reportProjectId} onClose={() => setReportProjectId(null)} />}
    </div>
  );
}