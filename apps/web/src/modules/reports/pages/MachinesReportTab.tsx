import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Cog, Clock, Zap, BarChart3 } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { EmptyState } from "../components/EmptyState";
import type { DateRange } from "../types";

interface MachinesReportTabProps {
  dateRange: DateRange;
}

interface MachineReportRow {
  machine_id: string;
  machine_name: string;
  machine_code: string;
  machine_type: string | null;
  current_status: string;
  production_seconds: number;
  downtime_seconds: number;
  total_seconds: number;
  sessions_count: number;
  workers_count: number;
  labor_cost: number;
  last_used_at: string | null;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const PIE_COLORS = ["#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6", "#10b981", "#22c55e", "#84cc16", "#eab308", "#f59e0b"];

export function MachinesReportTab(_props: MachinesReportTabProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MachineReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("v_machine_report")
        .select("*");

      if (error) {
        console.warn("[MachinesReportTab] v_machine_report non disponible, fallback machines");
        const { data: machines } = await supabase.from("machines").select("*").order("name");
        if (isMounted) {
          setRows(((machines ?? []) as Record<string, unknown>[]).map((m) => ({
            machine_id: m.id as string,
            machine_name: m.name as string,
            machine_code: m.code as string,
            machine_type: m.machine_type as string | null,
            current_status: m.current_status as string,
            production_seconds: 0,
            downtime_seconds: 0,
            total_seconds: 0,
            sessions_count: 0,
            workers_count: 0,
            labor_cost: 0,
            last_used_at: null,
          })));
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setRows((data as MachineReportRow[]) ?? []);
        setIsLoading(false);
      }
    }
    void load();
    return () => { isMounted = false; };
  }, []);

  const kpis = useMemo(() => {
    const totalMachines = rows.length;
    const usedMachines = rows.filter((r) => r.sessions_count > 0).length;
    const totalProduction = rows.reduce((s, r) => s + (r.production_seconds ?? 0), 0);
    const totalDowntime = rows.reduce((s, r) => s + (r.downtime_seconds ?? 0), 0);
    const utilizationRate = totalMachines > 0 ? (usedMachines / totalMachines) * 100 : 0;
    return { totalMachines, usedMachines, totalProduction, totalDowntime, utilizationRate };
  }, [rows]);

  const pieData = useMemo(() => {
    const used = rows
      .filter((r) => r.production_seconds > 0)
      .sort((a, b) => b.production_seconds - a.production_seconds)
      .slice(0, 8)
      .map((r, i) => ({
        name: r.machine_name,
        value: Math.round(r.production_seconds / 60),
        color: PIE_COLORS[i % PIE_COLORS.length],
      }));
    return used;
  }, [rows]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.production_seconds - a.production_seconds),
    [rows]
  );

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Cog}
          iconBg="bg-indigo-100 text-indigo-600"
          label={t("reports.kpi.totalMachines")}
          value={kpis.totalMachines}
        />
        <KpiCard
          icon={BarChart3}
          iconBg="bg-emerald-100 text-emerald-600"
          label={t("reports.kpi.utilizationRate")}
          value={`${kpis.utilizationRate.toFixed(0)}%`}
          subtitle={`${kpis.usedMachines} / ${kpis.totalMachines}`}
        />
        <KpiCard
          icon={Clock}
          iconBg="bg-blue-100 text-blue-600"
          label={t("reports.kpi.production")}
          value={formatDuration(kpis.totalProduction)}
        />
        <KpiCard
          icon={Zap}
          iconBg="bg-orange-100 text-orange-600"
          label={t("reports.kpi.downtime")}
          value={formatDuration(kpis.totalDowntime)}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={t("reports.charts.machinesUtilization")}>
          {pieData.length === 0 ? (
            <EmptyState icon={Cog} message={t("reports.noData")} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(v: number) => `${v} min`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t("reports.charts.productionOverTime")}>
          {sortedRows.filter((r) => r.production_seconds > 0).length === 0 ? (
            <EmptyState icon={Clock} message={t("reports.noData")} />
          ) : (
            <div className="flex h-full flex-col justify-center gap-2 overflow-y-auto">
              {sortedRows.filter((r) => r.production_seconds > 0).slice(0, 6).map((r) => {
                const total = r.production_seconds + r.downtime_seconds;
                const prodPct = total > 0 ? (r.production_seconds / total) * 100 : 0;
                return (
                  <div key={r.machine_id} className="flex items-center gap-3">
                    <span className="w-32 truncate text-xs font-semibold text-slate-700">{r.machine_name}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height: 8 }}>
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${prodPct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-600" dir="ltr">{formatDuration(r.production_seconds)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      {/* جدول الآلات */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">
          {t("reports.tabs.machines")} ({sortedRows.length})
        </h3>

        {sortedRows.length === 0 ? (
          <EmptyState icon={Cog} message={t("reports.noData")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 text-start">{t("setup.machineName")}</th>
                  <th className="px-3 py-2.5 text-start">{t("setup.machineCode")}</th>
                  <th className="px-3 py-2.5 text-left">{t("setup.runningTimeShort")}</th>
                  <th className="px-3 py-2.5 text-left">{t("setup.downtimeLabel")}</th>
                  <th className="px-3 py-2.5 text-left">{t("setup.sessionsCount")}</th>
                  <th className="px-3 py-2.5 text-left">{t("setup.workersUsingIt")}</th>
                  <th className="px-3 py-2.5 text-start">{t("setup.status")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.machine_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-start font-semibold text-slate-700">{r.machine_name}</td>
                    <td className="px-3 py-2.5 text-start text-xs text-slate-400" dir="ltr">{r.machine_code}</td>
                    <td className="px-3 py-2.5 text-left text-blue-600 font-semibold" dir="ltr">{formatDuration(r.production_seconds ?? 0)}</td>
                    <td className="px-3 py-2.5 text-left text-orange-600" dir="ltr">{formatDuration(r.downtime_seconds ?? 0)}</td>
                    <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{r.sessions_count}</td>
                    <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">{r.workers_count}</td>
                    <td className="px-3 py-2.5 text-start">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        r.current_status === "running" ? "bg-green-100 text-green-700"
                        : r.current_status === "maintenance" ? "bg-amber-100 text-amber-700"
                        : "bg-slate-200 text-slate-600"
                      }`}>
                        {r.current_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}