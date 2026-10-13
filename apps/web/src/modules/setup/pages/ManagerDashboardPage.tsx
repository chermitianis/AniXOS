import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createSafeChannel } from "../../../lib/realtimeChannel";
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
type SessionKind = "production" | "downtime" | "none";

interface MachineStatus {
  id: string;
  code: string;
  name: string;
  model: string;
  current_piece: string | null;
  current_project: string | null;
  current_worker: string | null;
  activity: string | null;
  session_kind: SessionKind;
  status: "running" | "warning" | "idle";
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

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // --------------------------------------------------------------------------
  // Load data
  // --------------------------------------------------------------------------
  const load = useCallback(async () => {
    const companyId = staffUser?.company_id;
    if (!companyId) {
      setIsLoading(false);
      return;
    }

    try {
      // ===== Step 1 — Parallel base fetches =====
      const [
        { data: openShifts },
        { data: allActiveSessions },
        { data: workersData },
        { data: allMachinesData },
        { data: allTaskTypes },
        { data: allStopReasons },
      ] = await Promise.all([
        supabase
          .from("work_shifts")
          .select("id, worker_id, started_at")
          .eq("company_id", companyId)
          .is("ended_at", null),
        supabase
          .from("work_sessions")
          .select(
            "id, worker_id, machine_id, piece_task_id, session_type, task_type_id, stop_reason_id, started_at",
          )
          .eq("company_id", companyId)
          .is("ended_at", null)
          .is("voided_at", null),
        supabase
          .from("workers")
          .select("id, full_name, is_active")
          .eq("company_id", companyId),
        supabase
          .from("machines")
          .select("id, code, name, machine_type, current_status")
          .eq("company_id", companyId)
          .eq("is_active", true),
        supabase.from("task_types").select("id, name").eq("company_id", companyId),
        supabase.from("stop_reasons").select("id, name").eq("company_id", companyId),
      ]);

      // ===== Step 2 — Current piece per open shift =====
      const shiftIds = (openShifts ?? []).map((s: any) => s.id);
      const { data: pieceWork } =
        shiftIds.length > 0
          ? await supabase
              .from("shift_piece_work")
              .select("shift_id, worker_id, piece_task_id, project_id, started_at")
              .in("shift_id", shiftIds)
              .is("ended_at", null)
              .order("started_at", { ascending: false })
          : { data: [] };

      // Keep only the most recent piece_work per worker
      const pieceWorkByWorker = new Map<string, any>();
      for (const pw of (pieceWork ?? []) as any[]) {
        if (!pieceWorkByWorker.has(pw.worker_id)) {
          pieceWorkByWorker.set(pw.worker_id, pw);
        }
      }
      const currentPieces = Array.from(pieceWorkByWorker.values());

      // ===== Step 3 — Details for pieces / projects / plannings =====
      const pieceIds = Array.from(
        new Set(currentPieces.map((p: any) => p.piece_task_id).filter(Boolean)),
      );
      const projectIds = Array.from(
        new Set(currentPieces.map((p: any) => p.project_id).filter(Boolean)),
      );

      const [piecesRes, projectsRes, planningsRes] = await Promise.all([
        pieceIds.length > 0
          ? supabase.from("pieces_tasks").select("id, name, code").in("id", pieceIds)
          : { data: [] },
        projectIds.length > 0
          ? supabase.from("projects").select("id, name, code").in("id", projectIds)
          : { data: [] },
        // ⚠️ Pas de filtre planned_date — on prend le planning le plus récent,
        // peu importe la date (le worker peut travailler sur une pièce planifiée hier).
        pieceIds.length > 0
          ? supabase
              .from("planning")
              .select("piece_task_id, worker_id, machine_id, planned_date")
              .in("piece_task_id", pieceIds)
              .not("machine_id", "is", null)
              .order("planned_date", { ascending: false })
          : { data: [] },
      ]);

      // ===== Step 4 — Lookup maps =====
      const pieceById = new Map<string, any>(
        ((piecesRes.data ?? []) as any[]).map((p) => [p.id, p]),
      );
      const projectById = new Map<string, any>(
        ((projectsRes.data ?? []) as any[]).map((p) => [p.id, p]),
      );
      const taskTypeById = new Map<string, string>(
        ((allTaskTypes ?? []) as any[]).map((t) => [t.id, t.name]),
      );
      const stopReasonById = new Map<string, string>(
        ((allStopReasons ?? []) as any[]).map((s) => [s.id, s.name]),
      );
      const workerById = new Map<string, any>(
        ((workersData ?? []) as any[]).map((w) => [w.id, w]),
      );
      const machineById = new Map<string, any>(
        ((allMachinesData ?? []) as any[]).map((m) => [m.id, m]),
      );

      // planning key = worker::piece — garde le premier (le plus récent après ORDER DESC)
      const planningByKey = new Map<string, any>();
      for (const p of (planningsRes.data ?? []) as any[]) {
        const key = `${p.worker_id}::${p.piece_task_id}`;
        if (!planningByKey.has(key)) planningByKey.set(key, p);
      }

      // sessions key = worker::piece — première session active
      const sessionByKey = new Map<string, any>();
      for (const s of (allActiveSessions ?? []) as any[]) {
        if (!s.piece_task_id) continue;
        const key = `${s.worker_id}::${s.piece_task_id}`;
        if (!sessionByKey.has(key)) sessionByKey.set(key, s);
      }

      // ===== Step 5 — KPIs =====
      const workersActive = new Set((openShifts ?? []).map((s: any) => s.worker_id)).size;
      const workersTotal = (workersData ?? []).filter((w: any) => w.is_active).length;
      const machinesTotal = (allMachinesData ?? []).length;

      // ===== Step 6 — Build active machine rows =====
      const activeRows: MachineStatus[] = [];
      const seenMachineIds = new Set<string>();

      for (const pw of currentPieces as any[]) {
        const key = `${pw.worker_id}::${pw.piece_task_id}`;
        const plan = planningByKey.get(key);
        const session = sessionByKey.get(key);

        // Résolution du machine_id : session en priorité, sinon planning
        const machineId = session?.machine_id ?? plan?.machine_id ?? null;
        if (!machineId) continue;
        if (seenMachineIds.has(machineId)) continue;

        const machine = machineById.get(machineId);
        if (!machine) continue;

        const piece = pieceById.get(pw.piece_task_id);
        const project = pw.project_id ? projectById.get(pw.project_id) : null;
        const worker = workerById.get(pw.worker_id);

        let activity: string | null = null;
        let sessionKind: SessionKind = "none";
        let activeStart: string | null = null;

        if (session) {
          activeStart = session.started_at;
          if (session.session_type === "production") {
            activity = taskTypeById.get(session.task_type_id ?? "") ?? null;
            sessionKind = "production";
          } else if (session.session_type === "downtime") {
            activity = stopReasonById.get(session.stop_reason_id ?? "") ?? null;
            sessionKind = "downtime";
          }
        }

        let progress = 0;
        if (activeStart) {
          const elapsedMin = Math.floor(
            (Date.now() - new Date(activeStart).getTime()) / 60000,
          );
          progress = Math.min(99, Math.round((elapsedMin / 480) * 100));
        }

        activeRows.push({
          id: machine.id,
          code: machine.code ?? "—",
          name: machine.name ?? "Machine",
          model: machine.machine_type ?? "—",
          current_piece: piece?.name ?? null,
          current_project: project?.name ?? null,
          current_worker: worker?.full_name ?? null,
          activity,
          session_kind: sessionKind,
          status:
            sessionKind === "production"
              ? "running"
              : sessionKind === "downtime"
                ? "warning"
                : "idle",
          progress,
        });
        seenMachineIds.add(machineId);
      }

      const machinesRunning = activeRows.length;
      const globalEfficiency =
        machinesTotal > 0 ? Math.round((machinesRunning / machinesTotal) * 100) : 0;

      setKpi({
        machinesRunning,
        machinesTotal,
        ofInProgress: 0,
        ofNew: 0,
        workersActive,
        workersTotal,
        globalEfficiency,
      });
      setMachines(activeRows);

      // ===== Step 7 — OF =====
      const { data: ofData } = await supabase
        .from("manufacturing_orders")
        .select("id, status")
        .eq("company_id", companyId);

      const ofInProgress =
        (ofData ?? []).filter((o: any) => o.status === "in_progress").length;
      const ofNew = (ofData ?? []).filter((o: any) => o.status === "ready").length;

      // ===== Step 8 — Production chart =====
      const todayDate = new Date();
      const days: Date[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayDate);
        d.setDate(todayDate.getDate() - i);
        days.push(d);
      }
      const fromIso = `${localDateStr(days[0])}T00:00:00.000Z`;
      const toIso = `${localDateStr(days[6])}T23:59:59.999Z`;

      const { data: prodSessions } = await supabase
        .from("work_sessions")
        .select("started_at")
        .eq("company_id", companyId)
        .eq("session_type", "production")
        .gte("started_at", fromIso)
        .lte("started_at", toIso)
        .is("voided_at", null);

      const countByDay = new Map<string, number>();
      for (const s of (prodSessions ?? []) as any[]) {
        const day = (s.started_at as string).slice(0, 10);
        countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
      }

      setProduction(
        days.map((d) => ({
          day: d.toLocaleDateString(i18n.language, { day: "2-digit", month: "short" }),
          quantity: countByDay.get(localDateStr(d)) ?? 0,
        })),
      );

      // ===== Step 9 — OF récents =====
      const { data: ofRecent } = await supabase
        .from("manufacturing_orders")
        .select(
          "id, order_number, product_name, quantity, status, planned_end_date, project_id, projects(name)",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(5);

      const ofIds = (ofRecent ?? []).map((o: any) => o.id);
      const { data: wpsData } =
        ofIds.length > 0
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

      setOfRows(
        (ofRecent ?? []).map((o: any) => {
          const wpInfo = wpByOf.get(o.id) ?? { total: 0, done: 0 };
          return {
            id: o.id,
            number: o.order_number ?? "—",
            client: o.projects?.name ?? "—",
            product: o.product_name ?? "—",
            quantity: o.quantity ?? 0,
            progress:
              wpInfo.total > 0 ? Math.round((wpInfo.done / wpInfo.total) * 100) : 0,
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
        }),
      );

      // ===== Step 10 — Projets =====
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, name, status, clients(name)")
        .eq("company_id", companyId)
        .neq("is_archived", true)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(4);

      const projectIdsList = (projectsData ?? []).map((p: any) => p.id);
      const { data: projOfs } =
        projectIdsList.length > 0
          ? await supabase
              .from("manufacturing_orders")
              .select("project_id, status")
              .eq("company_id", companyId)
              .in("project_id", projectIdsList)
          : { data: [] };

      const ofByProject = new Map<string, { total: number; done: number }>();
      for (const o of (projOfs ?? []) as any[]) {
        if (!o.project_id) continue;
        const entry = ofByProject.get(o.project_id) ?? { total: 0, done: 0 };
        entry.total += 1;
        if (o.status === "completed") entry.done += 1;
        ofByProject.set(o.project_id, entry);
      }

      setProjects(
        (projectsData ?? []).map((p: any) => {
          const info = ofByProject.get(p.id) ?? { total: 0, done: 0 };
          return {
            id: p.id,
            name: p.name ?? "—",
            client: p.clients?.name ?? "—",
            progress:
              info.total > 0 ? Math.round((info.done / info.total) * 100) : 0,
            doneOf: info.done,
            totalOf: info.total,
          };
        }),
      );

      // ===== Step 11 — Notifications =====
      const { data: reclamations } = await supabase
        .from("workshop_reclamations")
        .select("id, message, status, created_at, workers(full_name), machines(name)")
        .eq("company_id", companyId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5);

      setNotifications(
        (reclamations ?? []).map((r: any) => ({
          id: r.id,
          type:
            r.status === "resolu"
              ? "success"
              : r.status === "en_cours"
                ? "warning"
                : "danger",
          title: `${r.workers?.full_name ?? "—"}${
            r.machines?.name ? ` · ${r.machines.name}` : ""
          }`,
          subtitle: r.message,
          time: timeAgo(r.created_at, i18n.language),
        })),
      );
    } catch (err) {
      console.error("[Dashboard] load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [staffUser?.company_id, i18n.language]);

  // --------------------------------------------------------------------------
  // Initial load
  // --------------------------------------------------------------------------
  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load]);

  // --------------------------------------------------------------------------
  // Live updates
  // --------------------------------------------------------------------------
  useEffect(() => {
    const companyId = staffUser?.company_id;
    if (!companyId) return;

    const channel = createSafeChannel(`dashboard-live-${companyId}`);
    const filter = `company_id=eq.${companyId}`;

    const scheduleReload = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        void load();
      }, 400);
    };

    const tables = [
      "work_shifts",
      "shift_piece_work",
      "work_sessions",
      "machines",
      "manufacturing_orders",
      "workshop_reclamations",
      "pieces_tasks",
      "projects",
    ] as const;

    let ch = channel;
    for (const table of tables) {
      ch = ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        scheduleReload,
      );
    }
    ch.subscribe();

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, load]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  const today = useMemo(
    () =>
      new Date().toLocaleDateString(i18n.language, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    [i18n.language],
  );

  const currentTime = useMemo(
    () =>
      new Date().toLocaleTimeString(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [i18n.language],
  );

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
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-black tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {t("nav.dashboard", { defaultValue: "Tableau de bord" })}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("dashboard.subtitle", {
              defaultValue: "Vue d'ensemble de votre production",
            })}
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

      {/* KPI ROW */}
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

      {/* MAIN GRID */}
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
              {machines.map((m, idx) => {
                const badgeVariant =
                  m.status === "running"
                    ? "success"
                    : m.status === "warning"
                      ? "warning"
                      : "neutral";
                const badgeLabel =
                  m.status === "running"
                    ? m.activity ||
                      t("dashboard.machines.running", { defaultValue: "En production" })
                    : m.status === "warning"
                      ? m.activity ||
                        t("dashboard.machines.warning", { defaultValue: "En alerte" })
                      : t("dashboard.machines.noActivity", { defaultValue: "Aucun" });

                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 px-5 py-3 transition-colors"
                    style={{
                      borderTop:
                        idx > 0 ? "1px solid var(--border-subtle)" : "none",
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
                        <Badge variant={badgeVariant} size="sm" dot>
                          {badgeLabel}
                        </Badge>
                      </div>
                      <div
                        className="mt-0.5 text-[11px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {m.model}
                      </div>
                      {(m.current_project || m.current_piece || m.current_worker) && (
                        <div
                          className="mt-0.5 truncate text-[11px] font-semibold"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {m.current_project && <span>{m.current_project}</span>}
                          {m.current_piece && (
                            <>
                              {m.current_project && <span> · </span>}
                              <span>{m.current_piece}</span>
                            </>
                          )}
                          {m.current_worker && (
                            <>
                              {(m.current_project || m.current_piece) && (
                                <span> · </span>
                              )}
                              <span>{m.current_worker}</span>
                            </>
                          )}
                        </div>
                      )}
                      {m.status !== "idle" && (
                        <div className="mt-1.5">
                          <ProgressBar
                            value={m.progress}
                            color={m.status === "running" ? "green" : "orange"}
                            size="xs"
                          />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
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
                      style={{ backgroundColor: iconBg, color: iconColor }}
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

      {/* SECOND GRID */}
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
                        {t("setup.noDataYet", {
                          defaultValue: "Aucun ordre de fabrication",
                        })}
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
                  className="flex items-center gap-3 px-5 py-3"
                  style={{
                    borderTop:
                      idx > 0 ? "1px solid var(--border-subtle)" : "none",
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