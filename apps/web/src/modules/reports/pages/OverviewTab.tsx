import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Clock, TrendingUp, Package, DollarSign, Activity } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { EmptyState } from "../components/EmptyState";
import { toISO, type DateRange } from "../types";

interface OverviewTabProps {
  dateRange: DateRange;
}

interface SessionRow {
  id: string;
  session_type: "production" | "downtime";
  started_at: string;
  duration_seconds: number | null;
  project_id: string | null;
  worker_id: string | null;
  machine_id: string | null;
  task_types: { name: string } | null;
  stop_reasons: { name: string } | null;
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function OverviewTab({ dateRange }: OverviewTabProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [projectsCount, setProjectsCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const fromISO = toISO(dateRange.from);
      const toISOStr = toISO(dateRange.to);

      const [sessionsRes, projectsRes, invoicesRes] = await Promise.all([
        supabase
          .from("work_sessions")
          .select(
            "id, session_type, started_at, duration_seconds, project_id, worker_id, machine_id, task_types(name), stop_reasons(name)"
          )
          .gte("started_at", fromISO)
          .lte("started_at", toISOStr)
          .not("ended_at", "is", null)
          .is("voided_at", null),

        supabase.from("projects").select("id, status, is_archived").eq("is_archived", false),

        supabase
          .from("invoices")
          .select("id, status, issued_date, invoice_items(quantity, unit_price)")
          .in("status", ["issued", "paid"])
          .gte("issued_date", fromISO.slice(0, 10))
          .lte("issued_date", toISOStr.slice(0, 10)),
      ]);

      if (!isMounted) return;

      setSessions((sessionsRes.data as SessionRow[] | null) ?? []);

      const projects = (projectsRes.data as { status: string }[] | null) ?? [];
      setProjectsCount(projects.length);
      setCompletedCount(projects.filter((p) => p.status === "completed").length);

      const inv = (invoicesRes.data as { invoice_items: { quantity: number; unit_price: number }[] }[] | null) ?? [];
      let total = 0;
      for (const i of inv) {
        for (const item of i.invoice_items ?? []) {
          total += (item.quantity ?? 0) * (item.unit_price ?? 0);
        }
      }
      setRevenue(total);

      setIsLoading(false);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [dateRange.from, dateRange.to]);

  const totalProduction = useMemo(
    () => sessions.filter((s) => s.session_type === "production").reduce((s, x) => s + (x.duration_seconds ?? 0), 0),
    [sessions]
  );
  const totalDowntime = useMemo(
    () => sessions.filter((s) => s.session_type === "downtime").reduce((s, x) => s + (x.duration_seconds ?? 0), 0),
    [sessions]
  );
  const successRate = useMemo(() => {
    if (projectsCount === 0) return 0;
    return (completedCount / projectsCount) * 100;
  }, [projectsCount, completedCount]);

  const pieData = useMemo(() => {
    return [
      { name: t("reports.production"), value: Math.round(totalProduction / 60), color: "#3b82f6" },
      { name: t("reports.downtime"), value: Math.round(totalDowntime / 60), color: "#f97316" },
    ].filter((d) => d.value > 0);
  }, [totalProduction, totalDowntime, t]);

  const dailyBars = useMemo(() => {
    const map = new Map<string, { date: string; production: number; downtime: number }>();
    for (const s of sessions) {
      const day = s.started_at.slice(0, 10);
      const entry = map.get(day) ?? { date: day, production: 0, downtime: 0 };
      if (s.session_type === "production") entry.production += (s.duration_seconds ?? 0) / 3600;
      else entry.downtime += (s.duration_seconds ?? 0) / 3600;
      map.set(day, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date.slice(5),
        production: Number(d.production.toFixed(2)),
        downtime: Number(d.downtime.toFixed(2)),
      }));
  }, [sessions]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* KPI Cards — 2 cols mobile, 4 desktop */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Clock}
          iconBg="bg-blue-100 text-blue-600"
          label={t("reports.kpi.production")}
          value={formatHours(totalProduction)}
          subtitle={t("reports.vsPeriod")}
        />
        <KpiCard
          icon={Activity}
          iconBg="bg-orange-100 text-orange-600"
          label={t("reports.kpi.downtime")}
          value={formatHours(totalDowntime)}
          subtitle={t("reports.vsPeriod")}
        />
        <KpiCard
          icon={TrendingUp}
          iconBg="bg-emerald-100 text-emerald-600"
          label={t("reports.kpi.successRate")}
          value={`${successRate.toFixed(1)}%`}
          subtitle={`${completedCount} / ${projectsCount}`}
        />
        <KpiCard
          icon={DollarSign}
          iconBg="bg-violet-100 text-violet-600"
          label={t("reports.kpi.revenue")}
          value={revenue.toFixed(0)}
          subtitle={t("reports.periodRevenue")}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title={t("reports.charts.productionOverTime")}>
            {dailyBars.length === 0 ? (
              <EmptyState icon={Package} message={t("reports.noData")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyBars} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    formatter={(value: number) => `${value} ${t("setup.hoursShort")}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="production" stackId="a" fill="#3b82f6" name={t("reports.production")} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="downtime" stackId="a" fill="#f97316" name={t("reports.downtime")} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <ChartCard title={t("reports.charts.timeDistribution")}>
          {pieData.length === 0 ? (
            <EmptyState icon={Activity} message={t("reports.noData")} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(value: number) => `${value} min`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}