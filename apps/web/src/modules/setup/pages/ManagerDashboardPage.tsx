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
  FileText,
  Loader2,
  Cog,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
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
  type: "danger" | "info" | "success" | "warning";
  title: string;
  subtitle?: string;
  time: string;
}

interface ProductionPoint {
  day: string;
  quantity: number;
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
}

// ============================================================================
// Helpers
// ============================================================================
function timeAgo(iso: string, locale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "•";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ============================================================================
// Component
// ============================================================================
export function ManagerDashboardPage() {
  const { t, i18n } = useTranslation();
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
  });
  const [machines, setMachines] = useState<MachineStatus[]>([]);
  const [production, setProduction] = useState<ProductionPoint[]>([]);
  const [ofRows, setOfRows] = useState<OfRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

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

        // ----- 1. Machines : running / total -----
        const { data: machinesData } = await supabase
          .from("machines")
          .select("id, is_active, current_status")
          .eq("company_id", companyId)
          .eq("is_active", true);

        const machinesTotal = machinesData?.length ?? 0;
        const machinesRunning =
          machinesData?.filter((m: any) => m.current_status === "running").length ?? 0;

        // ----- 2. Workers : active / total -----
        const { data: workersData } = await supabase
          .from("workers")
          .select("id, is_active")
          .eq("company_id", companyId);

        const workersTotal = workersData?.filter((w: any) => w.is_active).length ?? 0;

        // Workers actifs = ayant au moins une session EN COURS (production ou downtime)
        const { data: activeSessions } = await supabase
          .from("work_sessions")
          .select("worker_id")
          .eq("company_id", companyId)
          .is("ended_at", null)
          .is("voided_at", null);

        const workersActive = new Set(
          (activeSessions ?? []).map((s: any) => s.worker_id).filter(Boolean),
        ).size;

        // ----- 3. OF : in_progress / ready -----
        const { data: ofData } = await supabase
          .from("manufacturing_orders")
          .select("id, status")
          .eq("company_id", companyId);

        const ofInProgress =
          ofData?.filter((o: any) => o.status === "in_progress").length ?? 0;
        const ofNew = ofData?.filter((o: any) => o.status === "ready").length ?? 0;

        // ----- 4. Global efficiency (machines running / total) -----
        const globalEfficiency =
          machinesTotal > 0 ? Math.round((machinesRunning / machinesTotal) * 100) : 0;

        if (isMounted) {
          setKpi({
            machinesRunning,
            machinesTotal,
            ofInProgress,
            ofNew,
            workersActive,
            workersTotal,
            globalEfficiency,
          });
        }

        // ----- 5. Machines détaillées (état + pièce en cours + progress) -----
        const { data: machinesDetail } = await supabase
          .from("machines")
          .select("id, code, name, machine_type, current_status")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name")
          .limit(6);

        const machineIds = (machinesDetail ?? []).map((m: any) => m.id);

        // Pour chaque machine : la session ouverte (pièce en cours + avancement)
        const { data: openSessions } = machineIds.length > 0
          ? await supabase
              .from("work_sessions")
              .select("machine_id, piece_task_id, started_at, pieces_tasks(name)")
              .in("machine_id", machineIds)
              .is("ended_at", null)
              .is("voided_at", null)
          : { data: [] };

        const openByMachine = new Map<string, any>();
        for (const s of (openSessions ?? []) as any[]) {
          if (!openByMachine.has(s.machine_id)) openByMachine.set(s.machine_id, s);
        }

        // Pour le progress : durée écoulée vs estimation (à défaut, calcul simple)
        const machinesList: MachineStatus[] = (machinesDetail ?? []).map((m: any) => {
          const open = openByMachine.get(m.id);
          const currentStatus: string = m.current_status ?? "idle";

          let status: MachineStatus["status"] = "stopped";
          if (currentStatus === "running") status = "running";
          else if (currentStatus === "maintenance") status = "warning";
          else status = "stopped";

          // Progress = % de temps écoulé depuis started_at (max 100) si session ouverte
          let progress = 0;
          if (open?.started_at) {
            const elapsedMin = Math.floor(
              (Date.now() - new Date(open.started_at).getTime()) / 60000,
            );
            // 8 heures = 480 min par shift ; on plafonne à 99 tant que pas terminé
            progress = Math.min(99, Math.round((elapsedMin / 480) * 100));
          }

          return {
            id: m.id,
            code: m.code ?? "—",
            name: m.name ?? "Machine",
            model: m.machine_type ?? "—",
            current_piece: open?.pieces_tasks?.name ?? null,
            status,
            progress,
          };
        });
        if (isMounted) setMachines(machinesList);

        // ----- 6. Production : 7 derniers jours (vrai calcul) -----
        const today = new Date();
        const days: Date[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          days.push(d);
        }
        const fromIso = `${localDateStr(days[0])}T00:00:00.000Z`;
        const toIso = `${localDateStr(days[6])}T23:59:59.999Z`;

        const { data: prodSessions } = await supabase
          .from("work_sessions")
          .select("started_at, duration_seconds")
          .eq("company_id", companyId)
          .eq("session_type", "production")
          .gte("started_at", fromIso)
          .lte("started_at", toIso)
          .is("voided_at", null);

        // Compter les sessions de production par jour (nombre de pièces produites)
        const countByDay = new Map<string, number>();
        for (const s of (prodSessions ?? []) as any[]) {
          const day = (s.started_at as string).slice(0, 10);
          countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
        }

        const productionData: ProductionPoint[] = days.map((d) => {
          const iso = localDateStr(d);
          const label = d.toLocaleDateString(i18n.language, {
            day: "2-digit",
            month: "short",
          });
          return { day: label, quantity: countByDay.get(iso) ?? 0 };
        });
        if (isMounted) setProduction(productionData);

        // ----- 7. OF récents (progress réelle) -----
        const { data: ofRecent } = await supabase
          .from("manufacturing_orders")
          .select(
            "id, order_number, product_name, quantity, status, planned_end_date, project_id, projects(name)",
          )
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(5);

        const ofIds = (ofRecent ?? []).map((o: any) => o.id);

        // Progress réelle : WP terminées / WP totales par OF
        const { data: wpsData } = ofIds.length > 0
          ? await supabase
              .from("of_work_packages")
              .select("manufacturing_order_id, status")
              .in("manufacturing_order_id", ofIds)
          : { data: [] };

        const wpByOf = new Map<string, { total: number; done: number }>();
        for (const wp of (wpsData ?? []) as any[]) {
          const entry = wpByOf.get(wp.manufacturing_order_id) ?? { total: 0, done: 0 };
          entry.total += 1;
          if (wp.status === "completed") entry.done += 1;
          wpByOf.set(wp.manufacturing_order_id, entry);
        }

        const ofList: OfRow[] = (ofRecent ?? []).map((o: any) => {
          const wpInfo = wpByOf.get(o.id) ?? { total: 0, done: 0 };
          const progress =
            wpInfo.total > 0 ? Math.round((wpInfo.done / wpInfo.total) * 100) : 0;

          return {
            id: o.id,
            number: o.order_number ?? "—",
            client: o.projects?.name ?? "—",
            product: o.product_name ?? "—",
            quantity: o.quantity ?? 0,
            progress,
            status:
              o.status === "completed"
                ? "done"
                : o.status === "in_progress"
                  ? "in_progress"
                  : "pending",
            deadline: o.planned_end_date
              ? new Date(o.planned_end_date).toLocaleDateString(i18n.language, {
                  day: "2-digit",
                  month: "short",
                })
              : "—",
          };
        });
        if (isMounted) setOfRows(ofList);

        // ----- 8. Projets en cours (progress réelle) -----
        const { data: projectsData } = await supabase
          .from("projects")
          .select("id, name, status, clients(name)")
          .eq("company_id", companyId)
          .neq("is_archived", true)
          .neq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(4);

        const projectIds = (projectsData ?? []).map((p: any) => p.id);

        // Pour chaque projet : OF total / OF terminés
        const { data: projOfs } = projectIds.length > 0
          ? await supabase
              .from("manufacturing_orders")
              .select("project_id, status")
              .eq("company_id", companyId)
              .in("project_id", projectIds)
          : { data: [] };

        const ofByProject = new Map<string, { total: number; done: number }>();
        for (const o of (projOfs ?? []) as any[]) {
          if (!o.project_id) continue;
          const entry = ofByProject.get(o.project_id) ?? { total: 0, done: 0 };
          entry.total += 1;
          if (o.status === "completed") entry.done += 1;
          ofByProject.set(o.project_id, entry);
        }

        const projectList: ProjectRow[] = (projectsData ?? []).map((p: any) => {
          const info = ofByProject.get(p.id) ?? { total: 0, done: 0 };
          const progress =
            info.total > 0 ? Math.round((info.done / info.total) * 100) : 0;
          return {
            id: p.id,
            name: p.name ?? "—",
            client: p.clients?.name ?? "—",
            progress,
            doneOf: info.done,
            totalOf: info.total,
          };
        });
        if (isMounted) setProjects(projectList);

        // ----- 9. Notifications (réclamations atelier non lues) -----
        const { data: reclamations } = await supabase
          .from("workshop_reclamations")
          .select("id, message, status, created_at, workers(full_name), machines(name)")
          .eq("company_id", companyId)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(5);

        const notifList: NotificationItem[] = (reclamations ?? []).map((r: any) => {
          const isResolved = r.status === "resolu";
          return {
            id: r.id,
            type: isResolved ? "success" : r.status === "en_cours" ? "warning" : "danger",
            title: `${r.workers?.full_name ?? "—"}${
              r.machines?.name ? ` · ${r.machines.name}` : ""
            }`,
            subtitle: r.message,
            time: timeAgo(r.created_at, i18n.language),
          };
        });
        if (isMounted) setNotifications(notifList);
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
  }, [staffUser?.company_id, i18n.language]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  const today = useMemo(() => {
    return new Date().toLocaleDateString(i18n.language, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, [i18n.language]);

  const currentTime = useMemo(() => {
    return new Date().toLocaleTimeString(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [i18n.language]);

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
          progress={kpi.globalEfficiency}
          progressColor="green"
        />

        {/* CTA card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 lg:col-span-2 xl:col-span-1"
          style={{
            background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
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
                  defaultValue: "Sessions de production",
                })}
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
                    dataKey="quantity"
                    stroke="#94a3b8"
                    strokeWidth={0}
                    dot={false}
                    legendType="none"
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
                    {m.status === "running" && (
                      <div className="mt-1.5">
                        <ProgressBar
                          value={m.progress}
                          color="green"
                          size="xs"
                        />
                      </div>
                    )}
                  </div>
                </li>
              ))}
              {machines.length === 0 && (
                <li
                  className="px-5 py-6 text-center text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("setup.noDataYet", { defaultValue: "Aucune machine active" })}
                </li>
              )}
            </ul>
          </CardBody>
        </Card>

        {/* Notifications (réclamations) */}
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
              {notifications.length === 0 && (
                <li
                  className="px-5 py-6 text-center text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("setup.reclamationsEmpty", {
                    defaultValue: "Aucune réclamation en attente",
                  })}
                </li>
              )}
              {notifications.map((n) => {
                const IconComp =
                  n.type === "danger"
                    ? AlertCircle
                    : n.type === "warning"
                      ? AlertCircle
                      : n.type === "success"
                        ? CheckCircle2
                        : FileText;

                const iconBg =
                  n.type === "danger"
                    ? "rgba(239, 68, 68, 0.12)"
                    : n.type === "warning"
                      ? "rgba(245, 158, 11, 0.12)"
                      : n.type === "success"
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(59, 130, 246, 0.12)";

                const iconColor =
                  n.type === "danger"
                    ? "#ef4444"
                    : n.type === "warning"
                      ? "#f59e0b"
                      : n.type === "success"
                        ? "#10b981"
                        : "#3b82f6";

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
                          className="line-clamp-1 text-[11px]"
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
      {/* SECOND GRID : OF Table + Projects                            */}
      {/* ============================================================ */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* OF Table */}
        <Card className="lg:col-span-7">
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
                  {ofRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-6 text-center text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {t("setup.noDataYet", { defaultValue: "Aucun ordre de fabrication" })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Projects */}
        <Card className="lg:col-span-5">
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
              {projects.length === 0 && (
                <li
                  className="px-5 py-6 text-center text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("setup.noDataYet", { defaultValue: "Aucun projet en cours" })}
                </li>
              )}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
