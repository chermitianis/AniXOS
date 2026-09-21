import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { HardHat, Clock, Target, Award } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { EmptyState } from "../components/EmptyState";
import type { Worker } from "../../../shared/types/database";
import { toISO, type DateRange } from "../types";

interface WorkersReportTabProps {
  dateRange: DateRange;
}

interface WorkerEvaluation {
  worker_id: string;
  worker_name: string;
  totalShiftSeconds: number;
  totalProductionSeconds: number;
  totalDowntimeSeconds: number;
  totalUncoveredSeconds: number;
  shiftsCount: number;
  piecesWorked: number;
  efficiencyPercent: number;
  downtimePercent: number;
  uncoveredPercent: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function WorkersReportTab({ dateRange }: WorkersReportTabProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [evaluations, setEvaluations] = useState<WorkerEvaluation[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadWorkers() {
      const { data } = await supabase
        .from("workers")
        .select("id, company_id, full_name, username, rfid_code, photo_url, hourly_cost, skill_level, is_active, created_at, updated_at")
        .order("full_name");
      setWorkers((data as Worker[]) ?? []);
    }
    void loadWorkers();
  }, []);

  const loadEvaluations = useCallback(async () => {
    setIsLoading(true);
    const fromISO = toISO(dateRange.from);
    const toISOStr = toISO(dateRange.to);

    const { data } = await supabase
      .from("v_shift_report")
      .select("shift_id, worker_id, worker_name, started_at, shift_duration_seconds, production_seconds, downtime_seconds, uncovered_seconds, pieces_worked")
      .gte("started_at", fromISO)
      .lte("started_at", toISOStr)
      .not("ended_at", "is", null);

    const map = new Map<string, WorkerEvaluation>();
    for (const row of (data as Record<string, unknown>[] | null) ?? []) {
      const wid = row.worker_id as string;
      const entry = map.get(wid) ?? {
        worker_id: wid,
        worker_name: row.worker_name as string,
        totalShiftSeconds: 0,
        totalProductionSeconds: 0,
        totalDowntimeSeconds: 0,
        totalUncoveredSeconds: 0,
        shiftsCount: 0,
        piecesWorked: 0,
        efficiencyPercent: 0,
        downtimePercent: 0,
        uncoveredPercent: 0,
      };
      entry.totalShiftSeconds += Number(row.shift_duration_seconds ?? 0);
      entry.totalProductionSeconds += Number(row.production_seconds ?? 0);
      entry.totalDowntimeSeconds += Number(row.downtime_seconds ?? 0);
      entry.totalUncoveredSeconds += Number(row.uncovered_seconds ?? 0);
      entry.shiftsCount += 1;
      entry.piecesWorked += Number(row.pieces_worked ?? 0);
      map.set(wid, entry);
    }

    const evals = Array.from(map.values()).map((e) => ({
      ...e,
      efficiencyPercent: e.totalShiftSeconds > 0 ? (e.totalProductionSeconds / e.totalShiftSeconds) * 100 : 0,
      downtimePercent: e.totalShiftSeconds > 0 ? (e.totalDowntimeSeconds / e.totalShiftSeconds) * 100 : 0,
      uncoveredPercent: e.totalShiftSeconds > 0 ? (e.totalUncoveredSeconds / e.totalShiftSeconds) * 100 : 0,
    }));

    setEvaluations(evals);
    setIsLoading(false);
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    void loadEvaluations();
  }, [loadEvaluations]);

  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`workers-reports-${staffUser.company_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_shifts", filter: `company_id=eq.${staffUser.company_id}` },
        () => void loadEvaluations()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, loadEvaluations]);

  const sortedByEfficiency = useMemo(
    () => [...evaluations].filter((e) => e.totalShiftSeconds > 600).sort((a, b) => b.efficiencyPercent - a.efficiencyPercent),
    [evaluations]
  );
  const topPerformers = sortedByEfficiency.slice(0, 5);
  const bottomPerformers = sortedByEfficiency.slice(-5).reverse();

  const kpis = useMemo(() => {
    const totalWorkers = evaluations.length;
    const avgEfficiency = totalWorkers > 0
      ? evaluations.reduce((s, e) => s + e.efficiencyPercent, 0) / totalWorkers
      : 0;
    const totalProduction = evaluations.reduce((s, e) => s + e.totalProductionSeconds, 0);
    const topPerformer = sortedByEfficiency[0]?.worker_name ?? "—";
    return { totalWorkers, avgEfficiency, totalProduction, topPerformer };
  }, [evaluations, sortedByEfficiency]);

  const filteredEvals = useMemo(
    () => (selectedWorkerId ? evaluations.filter((e) => e.worker_id === selectedWorkerId) : evaluations),
    [evaluations, selectedWorkerId]
  );

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={HardHat}
          iconBg="bg-indigo-100 text-indigo-600"
          label={t("reports.kpi.activeWorkers")}
          value={kpis.totalWorkers}
        />
        <KpiCard
          icon={Target}
          iconBg="bg-emerald-100 text-emerald-600"
          label={t("reports.kpi.avgEfficiency")}
          value={`${kpis.avgEfficiency.toFixed(1)}%`}
        />
        <KpiCard
          icon={Clock}
          iconBg="bg-blue-100 text-blue-600"
          label={t("reports.kpi.production")}
          value={formatDuration(kpis.totalProduction)}
        />
        <KpiCard
          icon={Award}
          iconBg="bg-amber-100 text-amber-600"
          label={t("reports.kpi.topPerformer")}
          value={kpis.topPerformer}
        />
      </div>

      {/* Filtre opérateur */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <label className="mb-1 block text-xs font-semibold text-slate-600 sm:text-sm">
          {t("setup.selectWorkerLabel")}
        </label>
        <select
          value={selectedWorkerId}
          onChange={(e) => setSelectedWorkerId(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("setup.allWorkers")}</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.full_name}</option>
          ))}
        </select>
      </div>

      {/* Tableau / Liste des évaluations */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700 sm:mb-4">
          {t("reports.workerEvaluation")} ({filteredEvals.length})
        </h3>

        {filteredEvals.length === 0 ? (
          <EmptyState icon={HardHat} message={t("reports.noData")} />
        ) : (
          <>
            {/* Vue mobile : cartes */}
            <div className="flex flex-col gap-2 md:hidden">
              {filteredEvals.map((e) => (
                <div key={e.worker_id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">
                      {e.worker_name}
                    </span>
                    <span className="shrink-0 text-lg">
                      {e.efficiencyPercent >= 70 ? "🌟" : e.efficiencyPercent >= 40 ? "⚠️" : "🔻"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("reports.shiftsCount")}
                      </div>
                      <div className="font-semibold text-slate-600" dir="ltr">
                        {e.shiftsCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("reports.piecesWorked")}
                      </div>
                      <div className="font-semibold text-slate-600" dir="ltr">
                        {e.piecesWorked}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("setup.totalProductionTime")}
                      </div>
                      <div className="font-semibold text-blue-600" dir="ltr">
                        {formatDuration(e.totalProductionSeconds)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">
                        {t("setup.totalDowntime")}
                      </div>
                      <div className="font-semibold text-orange-600" dir="ltr">
                        {formatDuration(e.totalDowntimeSeconds)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${
                          e.efficiencyPercent >= 70
                            ? "bg-emerald-500"
                            : e.efficiencyPercent >= 40
                              ? "bg-amber-500"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(100, e.efficiencyPercent)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-600" dir="ltr">
                      {e.efficiencyPercent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Vue desktop : tableau */}
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 text-start">{t("setup.worker")}</th>
                    <th className="px-3 py-2.5 text-left">{t("reports.shiftsCount")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.totalProductionTime")}</th>
                    <th className="px-3 py-2.5 text-left">{t("setup.totalDowntime")}</th>
                    <th className="px-3 py-2.5 text-left">{t("reports.piecesWorked")}</th>
                    <th className="px-3 py-2.5 text-left">{t("reports.efficiency")}</th>
                    <th className="px-3 py-2.5 text-start"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvals.map((e) => (
                    <tr key={e.worker_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-start font-semibold text-slate-700">{e.worker_name}</td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{e.shiftsCount}</td>
                      <td className="px-3 py-2.5 text-left text-blue-600 font-semibold" dir="ltr">{formatDuration(e.totalProductionSeconds)}</td>
                      <td className="px-3 py-2.5 text-left text-orange-600" dir="ltr">{formatDuration(e.totalDowntimeSeconds)}</td>
                      <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{e.piecesWorked}</td>
                      <td className="px-3 py-2.5 text-left">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${
                                e.efficiencyPercent >= 70 ? "bg-emerald-500"
                                : e.efficiencyPercent >= 40 ? "bg-amber-500"
                                : "bg-red-500"
                              }`}
                              style={{ width: `${Math.min(100, e.efficiencyPercent)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-600" dir="ltr">
                            {e.efficiencyPercent.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-start text-xs text-slate-400">
                        {e.efficiencyPercent >= 70 ? "🌟" : e.efficiencyPercent >= 40 ? "⚠️" : "🔻"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Top / Bottom */}
      {sortedByEfficiency.length >= 2 && (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          <ChartCard title={`🏆 ${t("reports.topPerformers")}`} height={Math.max(180, topPerformers.length * 44)}>
            <div className="flex h-full flex-col gap-2">
              {topPerformers.map((e, i) => (
                <div key={e.worker_id} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white sm:h-7 sm:w-7 ${
                    i === 0 ? "bg-amber-500" : i === 1 ? "bg-slate-400" : i === 2 ? "bg-orange-500" : "bg-emerald-500"
                  }`}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{e.worker_name}</span>
                  <span className="shrink-0 text-sm font-bold text-emerald-600" dir="ltr">{e.efficiencyPercent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title={`🔻 ${t("reports.bottomPerformers")}`} height={Math.max(180, bottomPerformers.length * 44)}>
            <div className="flex h-full flex-col gap-2">
              {bottomPerformers.map((e) => (
                <div key={e.worker_id} className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white sm:h-7 sm:w-7">!</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{e.worker_name}</span>
                  <span className="shrink-0 text-sm font-bold text-amber-600" dir="ltr">{e.efficiencyPercent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
}