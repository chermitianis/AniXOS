import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Monitor,
  Package,
  Users,
  TrendingUp,
  ArrowRight,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  FileText,
  Loader2,
  Cog,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  Badge,
  Card,
  CardAction,
  CardBody,
  CardHeader,
  CardTitle,
  KpiCard,
  ProgressBar,
} from "../../../shared/ui";

// ============================================================================
// Types
// ============================================================================
interface MachineStatus {
  id: string;
  code: string;
  name: string;
  model: string;
  current_piece: string | null;
  status: "running" | "warning" | "stopped";
  progress: number;
}

interface NotificationItem {
  id: string;
  type: "danger" | "info" | "success" | "warning" | "message";
  title: string;
  subtitle?: string;
  time: string;
}

interface UpcomingTask {
  id: string;
  time: string;
  label: string;
  sublabel?: string;
  color: "orange" | "blue" | "teal";
}

interface ProductionPoint {
  day: string;
  quantity: number;
  target: number;
}

interface OfRow {
  id: string;
  number: string;
  client: string;
  product: string;
  quantity: number;
  progress: number;
  status: "in_progress" | "done" | "pending";
  deadline: string;
}

interface ProjectRow {
  id: string;
  name: string;
  client: string;
  progress: number;
  doneOf: number;
  totalOf: number;
}

interface KpiData {
  machinesRunning: number;
  machinesTotal: number;
  ofInProgress: number;
  ofNew: number;
  workersActive: number;
  workersTotal: number;
  globalEfficiency: number;
  globalTrend: number;
}

// ============================================================================
// Component
// ============================================================================
export function ManagerDashboardPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiData>({
    machinesRunning: 0,
    machinesTotal: 0,
    ofInProgress: 0,
    ofNew: 0,
    workersActive: 0,
    workersTotal: 0,
    globalEfficiency: 0,
    globalTrend: 0,
  });
  const [machines, setMachines] = useState<MachineStatus[]>([]);
  const [production, setProduction] = useState<ProductionPoint[]>([]);
  const [ofRows, setOfRows] = useState<OfRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [tasks, setTasks] = useState<UpcomingTask[]>([]);

  // --------------------------------------------------------------------------
  // Load data
  // --------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);

      try {
        const companyId = staffUser?.company_id;
        if (!companyId) {
          setIsLoading(false);
          return;
        }

        // 1. KPI : machines
        const { data: machinesData } = await supabase
          .from("machines")
          .select("id, is_active, current_status")
          .eq("company_id", companyId)
          .eq("is_active", true);

        const machinesTotal = machinesData?.length ?? 0;
        const machinesRunning =
          machinesData?.filter((m: any) => m.current_status === "running").length ?? 0;

        // 2. KPI : OF
        const { data: ofData } = await supabase
          .from("manufacturing_orders")
          .select("id, status")
          .eq("company_id", companyId);

        const ofInProgress =
          ofData?.filter((o: any) => o.status === "in_progress").length ?? 0;
        const ofNew = ofData?.filter((o: any) => o.status === "ready").length ?? 0;

        // 3. KPI : workers
        const { data: workersData } = await supabase
          .from("workers")
          .select("id, is_active")
          .eq("company_id", companyId);

        const workersTotal = workersData?.filter((w: any) => w.is_active).length ?? 0;

        const { data: shiftsData } = await supabase
          .from("work_shifts")
          .select("worker_id")
          .eq("company_id", companyId)
          .is("ended_at", null);

        const workersActive = new Set(shiftsData?.map((s: any) => s.worker_id)).size;

        // 4. Global efficiency
        const globalEfficiency =
          machinesTotal > 0
            ? Math.round((machinesRunning / machinesTotal) * 100)
            : 0;
        const globalTrend = 5;

        if (isMounted) {
          setKpi({
            machinesRunning,
            machinesTotal,
            ofInProgress,
            ofNew,
            workersActive,
            workersTotal,
            globalEfficiency,
            globalTrend,
          });
        }

        // 5. Machines détaillées
        const { data: machinesDetail } = await supabase
          .from("machines")
          .select("id, code, name, machine_type")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .limit(4);

        const machinesList: MachineStatus[] = (machinesDetail ?? []).map(
          (m: any, idx: number) => {
            const statuses: Array<"running" | "warning" | "stopped"> = [
              "running",
              "running",
              "warning",
              "stopped",
            ];
            const status = statuses[idx % statuses.length];
            return {
              id: m.id,
              code: m.code ?? `CNC-0${idx + 1}`,
              name: m.name ?? "Machine",
              model: m.machine_type ?? "DMC 635 V",
              current_piece:
                status === "running"
                  ? `Pièce ${String.fromCharCode(65 + idx)}-${100 + idx * 12}`
                  : null,
              status,
              progress: status === "running" ? 65 + idx * 8 : status === "warning" ? 42 : 0,
            };
          },
        );
        if (isMounted) setMachines(machinesList);

        // 6. Production : 7 derniers jours (démo)
        const days = [
          "05 Juin",
          "06 Juin",
          "07 Juin",
          "08 Juin",
          "09 Juin",
          "10 Juin",
          "11 Juin",
        ];
        const productionData: ProductionPoint[] = days.map((day, i) => ({
          day,
          quantity: [50, 80, 100, 90, 95, 105, 140][i],
          target: [70, 85, 95, 100, 105, 110, 120][i],
        }));
        if (isMounted) setProduction(productionData);

        // 7. OF récents — ✅ Corrigé : suppression de "clients?"
        const { data: ofRecent } = await supabase
          .from("manufacturing_orders")
          .select(
            "id, order_number, product_name, quantity, status, planned_end_date, projects(name)",
          )
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(5);

        const ofList: OfRow[] = (ofRecent ?? []).map((o: any, i: number) => ({
          id: o.id,
          number: o.order_number ?? `OF-2025-0${14 - i}`,
          client: o.projects?.name ?? "Client",
          product: o.product_name ?? "Produit",
          quantity: o.quantity ?? 0,
          progress: [76, 42, 100, 65, 0][i % 5],
          status:
            o.status === "completed"
              ? "done"
              : o.status === "in_progress"
                ? "in_progress"
                : "pending",
          deadline: o.planned_end_date
            ? new Date(o.planned_end_date).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
              })
            : `${12 + i} Juin`,
        }));
        if (isMounted) setOfRows(ofList);

        // 8. Projets en cours
        const { data: projectsData } = await supabase
          .from("projects")
          .select("id, name, status, clients(name)")
          .eq("company_id", companyId)
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(4);

        const projectList: ProjectRow[] = (projectsData ?? []).map((p: any, i: number) => ({
          id: p.id,
          name: p.name ?? `Projet ${i + 1}`,
          client: p.clients?.name ?? "Client",
          progress: [60, 40, 75, 20][i % 4],
          doneOf: [3, 2, 4, 1][i % 4],
          totalOf: [5, 4, 6, 5][i % 4],
        }));
        if (isMounted) setProjects(projectList);

        // 9. Notifications (démo)
        const notifList: NotificationItem[] = [
          {
            id: "n1",
            type: "danger",
            title: "CNC-03 – Arrêt machine",
            subtitle: "Maintenance requise",
            time: "il y a 12 min",
          },
          {
            id: "n2",
            type: "info",
            title: "Nouvelle commande client",
            subtitle: "OF-2025-014",
            time: "il y a 28 min",
          },
          {
            id: "n3",
            type: "success",
            title: "OF-2025-011 – Terminée",
            subtitle: "Pièce livrée au client",
            time: "il y a 1 h",
          },
          {
            id: "n4",
            type: "warning",
            title: "Stock outil faible",
            subtitle: "Outil T10 – Fraise",
            time: "il y a 2 h",
          },
          {
            id: "n5",
            type: "message",
            title: "Rapport quotidien",
            subtitle: "Disponible (11 Juin 2025)",
            time: "il y a 3 h",
          },
        ];
        if (isMounted) setNotifications(notifList);

        // 10. Tâches à venir (démo)
        const taskList: UpcomingTask[] = [
          {
            id: "t1",
            time: "15:00",
            label: "Démarrage OF-2025-015",
            sublabel: "CNC-02",
            color: "orange",
          },
          {
            id: "t2",
            time: "16:30",
            label: "Contrôle qualité",
            sublabel: "Pièce B-112",
            color: "teal",
          },
          {
            id: "t3",
            time: "18:00",
            label: "Maintenance préventive",
            sublabel: "CNC-04",
            color: "blue",
          },
          {
            id: "t4",
            time: "20:00",
            label: "Clôture de journée",
            sublabel: "Rapport et sauvegarde",
            color: "blue",
          },
        ];
        if (isMounted) setTasks(taskList);
      } catch (err) {
        console.error("[Dashboard] load error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [staffUser?.company_id]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  const today = useMemo(() => {
    return new Date().toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  const currentTime = useMemo(() => {
    return new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2
          size={24}
          className="animate-spin"
          style={{ color: "var(--accent-blue)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* HEADER                                                       */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-black tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {t("nav.dashboard", { defaultValue: "Tableau de bord" })}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("dashboard.subtitle", { defaultValue: "Vue d'ensemble de votre production" })}
          </p>
        </div>
        <div
          className="flex items-center gap-4 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={14} />
            {today}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} />
            {currentTime}
          </span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* KPI ROW                                                      */}
      {/* ============================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard
          icon={<Monitor size={20} />}
          iconColor="blue"
          label={t("dashboard.kpi.machinesRunning", {
            defaultValue: "Machines en production",
          })}
          value={kpi.machinesRunning}
          total={kpi.machinesTotal}
          trend={{ direction: "up", value: "+9.01%" }}
          progress={
            kpi.machinesTotal > 0
              ? Math.round((kpi.machinesRunning / kpi.machinesTotal) * 100)
              : 0
          }
          progressColor="green"
        />

        <KpiCard
          icon={<Package size={20} />}
          iconColor="green"
          label={t("dashboard.kpi.ofInProgress", {
            defaultValue: "Ordres de fabrication",
          })}
          value={kpi.ofInProgress}
          caption={`${kpi.ofNew} ${t("dashboard.kpi.new", { defaultValue: "nouveaux" })}`}
          trend={{ direction: "up", value: "+6.27%" }}
        />

        <KpiCard
          icon={<Users size={20} />}
          iconColor="purple"
          label={t("dashboard.kpi.workersActive", {
            defaultValue: "Opérateurs actifs",
          })}
          value={kpi.workersActive}
          total={kpi.workersTotal}
          progress={
            kpi.workersTotal > 0
              ? Math.round((kpi.workersActive / kpi.workersTotal) * 100)
              : 0
          }
          progressColor="purple"
        />

        <KpiCard
          icon={<TrendingUp size={20} />}
          iconColor="orange"
          label={t("dashboard.kpi.globalEfficiency", {
            defaultValue: "Rendement global",
          })}
          value={`${kpi.globalEfficiency}%`}
          trend={{ direction: "up", value: `+${kpi.globalTrend}%` }}
          progress={kpi.globalEfficiency}
          progressColor="green"
        />

        {/* CTA card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 lg:col-span-2 xl:col-span-1"
          style={{
            background:
              "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="relative z-10 flex h-full flex-col justify-between gap-4">
            <p className="text-sm font-bold leading-snug text-white">
              {t("dashboard.cta.title", {
                defaultValue: "Une production plus intelligente, une vision complète.",
              })}
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 self-start rounded-lg px-3.5 py-2 text-xs font-bold text-white transition-colors"
              style={{ backgroundColor: "var(--brand-orange)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--brand-orange-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--brand-orange)";
              }}
            >
              {t("dashboard.cta.button", { defaultValue: "Découvrir la plateforme" })}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="pointer-events-none absolute -right-6 -bottom-6 opacity-10">
            <Monitor size={120} className="text-white" />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MAIN GRID : Chart + Machines + Notifications                 */}
      {/* ============================================================ */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Production Chart */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle size="md">
                {t("dashboard.production.title", { defaultValue: "Production" })}
              </CardTitle>
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--text-tertiary)" }}
              >
                —{" "}
                {t("dashboard.production.subtitle", {
                  defaultValue: "7 derniers jours",
                })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <span
                className="inline-flex items-center gap-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: "var(--accent-blue)" }}
                />
                {t("dashboard.production.legendQty", {
                  defaultValue: "Quantité produite",
                })}
              </span>
              <span
                className="inline-flex items-center gap-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: "var(--text-tertiary)" }}
                />
                {t("dashboard.production.legendTarget", { defaultValue: "Objectif" })}
              </span>
            </div>
          </CardHeader>
          <CardBody>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={production}
                  margin={{ top: 5, right: 5, bottom: 5, left: -20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#94a3b833"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#f1f5f9",
                    }}
                  />
                  <Bar
                    dataKey="quantity"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Machine status */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.machines.title", {
                defaultValue: "État des machines CNC",
              })}
            </CardTitle>
            <CardAction>
              {t("common.viewAll", { defaultValue: "Voir tout →" })}
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <ul>
              {machines.map((m, idx) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-5 py-3 transition-colors"
                  style={{
                    borderTop: idx > 0 ? "1px solid var(--border-subtle)" : "none",
                  }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-muted)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <Cog size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate text-sm font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {m.code}
                      </span>
                      <Badge
                        variant={
                          m.status === "running"
                            ? "success"
                            : m.status === "warning"
                              ? "warning"
                              : "danger"
                        }
                        size="sm"
                        dot
                      >
                        {m.status === "running"
                          ? t("dashboard.machines.running", {
                              defaultValue: "En production",
                            })
                          : m.status === "warning"
                            ? t("dashboard.machines.warning", {
                                defaultValue: "En alerte",
                              })
                            : t("dashboard.machines.stopped", {
                                defaultValue: "Arrêté",
                              })}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className="truncate text-[11px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {m.model}
                      </span>
                      {m.current_piece && (
                        <span
                          className="truncate text-[11px] font-semibold"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {m.current_piece}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar
                        value={m.progress}
                        color={
                          m.status === "running"
                            ? "green"
                            : m.status === "warning"
                              ? "orange"
                              : "red"
                        }
                        size="xs"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* Notifications */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.notifications.title", {
                defaultValue: "Alertes & notifications",
              })}
            </CardTitle>
            <CardAction>
              {t("common.viewAll", { defaultValue: "Voir tout →" })}
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-2">
            <ul className="space-y-1">
              {notifications.map((n) => {
                const IconComp =
                  n.type === "danger"
                    ? AlertCircle
                    : n.type === "warning"
                      ? AlertTriangle
                      : n.type === "success"
                        ? CheckCircle2
                        : n.type === "message"
                          ? FileText
                          : Info;

                const iconBg =
                  n.type === "danger"
                    ? "rgba(239, 68, 68, 0.12)"
                    : n.type === "warning"
                      ? "rgba(245, 158, 11, 0.12)"
                      : n.type === "success"
                        ? "rgba(16, 185, 129, 0.12)"
                        : n.type === "message"
                          ? "rgba(59, 130, 246, 0.12)"
                          : "rgba(100, 116, 139, 0.12)";

                const iconColor =
                  n.type === "danger"
                    ? "#ef4444"
                    : n.type === "warning"
                      ? "#f59e0b"
                      : n.type === "success"
                        ? "#10b981"
                        : n.type === "message"
                          ? "#3b82f6"
                          : "#64748b";

                return (
                  <li
                    key={n.id}
                    className="flex items-start gap-3 px-5 py-2.5 transition-colors"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: iconBg,
                        color: iconColor,
                      }}
                    >
                      <IconComp size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-xs font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {n.title}
                      </p>
                      {n.subtitle && (
                        <p
                          className="truncate text-[11px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {n.subtitle}
                        </p>
                      )}
                    </div>
                    <span
                      className="shrink-0 text-[10px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {n.time}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* ============================================================ */}
      {/* SECOND GRID : OF Table + Projects + Tasks                    */}
      {/* ============================================================ */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* OF Table */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.of.title", { defaultValue: "Ordres de fabrication" })}
            </CardTitle>
            <CardAction>
              {t("common.viewAll", { defaultValue: "Voir tout →" })}
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {[
                      t("dashboard.of.colNumber", { defaultValue: "N° OF" }),
                      t("dashboard.of.colClient", { defaultValue: "Client" }),
                      t("dashboard.of.colProduct", { defaultValue: "Produit" }),
                      t("dashboard.of.colQty", { defaultValue: "Qté" }),
                      t("dashboard.of.colProgress", { defaultValue: "Progression" }),
                      t("dashboard.of.colStatus", { defaultValue: "Statut" }),
                      t("dashboard.of.colDeadline", { defaultValue: "Échéance" }),
                    ].map((label, i) => (
                      <th
                        key={i}
                        className={`px-${i === 0 || i === 6 ? "5" : "3"} py-2 text-[10px] font-bold uppercase tracking-wider ${
                          i === 3 ? "text-center" : "text-start"
                        }`}
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ofRows.map((of) => (
                    <tr
                      key={of.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              of.status === "done"
                                ? "bg-blue-500"
                                : of.status === "in_progress"
                                  ? "bg-emerald-500"
                                  : "bg-slate-400"
                            }`}
                          />
                          <span
                            className="font-mono text-xs font-semibold"
                            style={{ color: "var(--text-primary)" }}
                            dir="ltr"
                          >
                            {of.number}
                          </span>
                        </div>
                      </td>
                      <td
                        className="px-3 py-3 text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {of.client}
                      </td>
                      <td
                        className="px-3 py-3 text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {of.product}
                      </td>
                      <td
                        className="px-3 py-3 text-center text-xs tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                        dir="ltr"
                      >
                        {of.quantity}
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-[80px]">
                          <ProgressBar value={of.progress} size="xs" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            of.status === "done"
                              ? "info"
                              : of.status === "in_progress"
                                ? "success"
                                : "neutral"
                          }
                          size="sm"
                          dot
                        >
                          {of.status === "done"
                            ? t("dashboard.of.done", { defaultValue: "Terminée" })
                            : of.status === "in_progress"
                              ? t("dashboard.of.inProgress", {
                                  defaultValue: "En cours",
                                })
                              : t("dashboard.of.pending", {
                                  defaultValue: "En attente",
                                })}
                        </Badge>
                      </td>
                      <td
                        className="px-5 py-3 text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {of.deadline}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Projects */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.projects.title", { defaultValue: "Projets en cours" })}
            </CardTitle>
            <CardAction>
              {t("common.viewAll", { defaultValue: "Voir tout →" })}
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <ul>
              {projects.map((p, idx) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-5 py-3 transition-colors"
                  style={{
                    borderTop: idx > 0 ? "1px solid var(--border-subtle)" : "none",
                  }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-muted)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <Package size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {p.name}
                    </p>
                    <p
                      className="truncate text-[11px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {p.client}
                    </p>
                    <div className="mt-1.5">
                      <ProgressBar value={p.progress} size="xs" />
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--text-primary)" }}
                      dir="ltr"
                    >
                      {p.progress}%
                    </span>
                    <p
                      className="text-[10px]"
                      style={{ color: "var(--text-tertiary)" }}
                      dir="ltr"
                    >
                      {p.doneOf}/{p.totalOf} OF
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* Tasks */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.tasks.title", { defaultValue: "Tâches à venir" })}
            </CardTitle>
            <CardAction>
              {t("common.viewAll", { defaultValue: "Voir tout →" })}
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-2">
            <ul className="space-y-0.5">
              {tasks.map((task) => {
                const barColor =
                  task.color === "orange"
                    ? "bg-orange-500"
                    : task.color === "teal"
                      ? "bg-teal-500"
                      : "bg-blue-500";
                return (
                  <li
                    key={task.id}
                    className="flex items-start gap-3 px-5 py-2.5 transition-colors"
                  >
                    <span
                      className={`mt-1 h-8 w-1 shrink-0 rounded-full ${barColor}`}
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className="font-mono text-xs font-bold"
                        style={{ color: "var(--text-secondary)" }}
                        dir="ltr"
                      >
                        {task.time}
                      </span>
                      <p
                        className="truncate text-xs font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {task.label}
                      </p>
                      {task.sublabel && (
                        <p
                          className="truncate text-[11px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {task.sublabel}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}