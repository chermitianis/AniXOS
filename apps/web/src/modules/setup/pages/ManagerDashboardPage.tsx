import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Monitor,
  Package,
  Users,
  TrendingUp,
  Calendar,
  Clock,
  AlertCircle,
  FileText,
  Loader2,
  Cog,
  Wrench,
  Bell,
  Timer,
  ArrowLeft,
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
type MachineDisplayStatus =
  | "running"
  | "warning"
  | "occupied"
  | "idle"
  | "maintenance";

type SessionKind = "production" | "downtime" | "none";

type DashboardView =
  | "home"
  | "machines"
  | "operators"
  | "of"
  | "projects"
  | "alerts";

interface MachineRow {
  id: string;
  code: string;
  name: string;
  model: string;
  current_piece: string | null;
  current_project: string | null;
  current_worker: string | null;
  activity: string | null;
  display_status: MachineDisplayStatus;
  elapsed_minutes: number | null;
  estimated_minutes: number | null;
}

interface WorkerDetailRow {
  id: string;
  full_name: string;
  current_machine_code: string | null;
  current_machine_name: string | null;
  current_project: string | null;
  current_piece: string | null;
  session_kind: SessionKind;
  activity: string | null;
  session_started_at: string | null;
  elapsed_minutes: number | null;
  shift_started_at: string;
}

interface AlertItem {
  id: string;
  kind: "reclamation" | "of_late" | "session_suspect" | "maintenance";
  severity: "danger" | "warning" | "info";
  title: string;
  message: string;
  created_at: string;
  pageKey?: string;
}

interface ProductionPoint {
  day: string;
  hours: number;
  pieces: number;
}

interface OfRow {
  id: string;
  number: string;
  project_name: string;
  product: string;
  quantity: number;
  progress: number;
  wps_done: number;
  wps_total: number;
  status: "done" | "in_progress" | "late" | "partial" | "pending";
  deadline: string;
  days_left: number | null;
}

interface ProjectRow {
  id: string;
  name: string;
  client: string;
  progress: number;
  piecesDone: number;
  piecesTotal: number;
}

interface KpiData {
  machinesRunning: number;
  machinesAvailable: number;
  machinesTotal: number;
  ofInProgress: number;
  ofLate: number;
  workersPresent: number;
  workersProductive: number;
  workersTotal: number;
  globalEfficiency: number;
  alertsCount: number;
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
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} j`;
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysBetween(fromIso: string, toDate: Date): number {
  const from = new Date(fromIso);
  const diffMs = toDate.getTime() - from.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

// ============================================================================
// Small UI components
// ============================================================================
function BackHeader({
  title,
  subtitle,
  onBack,
  badge,
  dateStr,
  timeStr,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  badge?: string | number;
  dateStr: string;
  timeStr: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-muted)]"
          style={{ borderColor: "var(--border-subtle)" }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1
              className="truncate text-xl font-black tracking-tight md:text-2xl"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </h1>
            {badge !== undefined && badge !== "" && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold"
                style={{
                  backgroundColor: "var(--bg-muted)",
                  color: "var(--text-secondary)",
                }}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="truncate text-sm" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div
        className="flex items-center gap-4 text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={14} />
          {dateStr}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock size={14} />
          {timeStr}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="rounded-xl border border-dashed p-10 text-center text-sm"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-strong)",
        color: "var(--text-tertiary)",
      }}
    >
      {label}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================
export function ManagerDashboardPage() {
  const { t, i18n } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [view, setView] = useState<DashboardView>("home");
  const [isLoading, setIsLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiData>({
    machinesRunning: 0,
    machinesAvailable: 0,
    machinesTotal: 0,
    ofInProgress: 0,
    ofLate: 0,
    workersPresent: 0,
    workersProductive: 0,
    workersTotal: 0,
    globalEfficiency: 0,
    alertsCount: 0,
  });
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [workersDetail, setWorkersDetail] = useState<WorkerDetailRow[]>([]);
  const [production, setProduction] = useState<ProductionPoint[]>([]);
  const [ofRows, setOfRows] = useState<OfRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

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
      const now = new Date();

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
            "id, worker_id, machine_id, piece_task_id, project_id, session_type, task_type_id, stop_reason_id, started_at",
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
          .select("id, code, name, machine_type, current_status, is_active")
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
          ? supabase
              .from("pieces_tasks")
              .select(
                "id, name, code, quantity, estimated_time_minutes, estimated_minutes, manufacturing_order_id, project_id",
              )
              .in("id", pieceIds)
          : { data: [] },
        projectIds.length > 0
          ? supabase
              .from("projects")
              .select("id, name, code, clients(name)")
              .in("id", projectIds)
          : { data: [] },
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
        ((allTaskTypes ?? []) as any[]).map((tt) => [tt.id, tt.name]),
      );
      const stopReasonById = new Map<string, string>(
        ((allStopReasons ?? []) as any[]).map((sr) => [sr.id, sr.name]),
      );
      const workerById = new Map<string, any>(
        ((workersData ?? []) as any[]).map((w) => [w.id, w]),
      );
      const machineById = new Map<string, any>(
        ((allMachinesData ?? []) as any[]).map((m) => [m.id, m]),
      );

      const planningByKey = new Map<string, any>();
      for (const p of (planningsRes.data ?? []) as any[]) {
        const key = `${p.worker_id}::${p.piece_task_id}`;
        if (!planningByKey.has(key)) planningByKey.set(key, p);
      }

      const sessionByKey = new Map<string, any>();
      for (const s of (allActiveSessions ?? []) as any[]) {
        if (!s.piece_task_id) continue;
        const key = `${s.worker_id}::${s.piece_task_id}`;
        if (!sessionByKey.has(key)) sessionByKey.set(key, s);
      }

      // ===== Step 5 — KPIs =====
      const workersTotal = (workersData ?? []).filter((w: any) => w.is_active).length;
      const workersPresent = new Set(
        (openShifts ?? []).map((s: any) => s.worker_id),
      ).size;
      const workersProductive = new Set(
        (allActiveSessions ?? [])
          .filter((s: any) => s.session_type === "production")
          .map((s: any) => s.worker_id),
      ).size;

      const machinesTotal = (allMachinesData ?? []).length;
      const machinesAvailable = (allMachinesData ?? []).filter(
        (m: any) => m.current_status !== "maintenance",
      ).length;

      // ===== Step 6 — Build machine rows =====
      const machineRowsMap = new Map<string, MachineRow>();

      for (const m of (allMachinesData ?? []) as any[]) {
        machineRowsMap.set(m.id, {
          id: m.id,
          code: m.code ?? "—",
          name: m.name ?? "Machine",
          model: m.machine_type ?? "—",
          current_piece: null,
          current_project: null,
          current_worker: null,
          activity: null,
          display_status: m.current_status === "maintenance" ? "maintenance" : "idle",
          elapsed_minutes: null,
          estimated_minutes: null,
        });
      }

      // Enrich with worker context (occupied, no active session yet)
      for (const pw of currentPieces as any[]) {
        const key = `${pw.worker_id}::${pw.piece_task_id}`;
        const plan = planningByKey.get(key);
        const session = sessionByKey.get(key);

        const machineId = session?.machine_id ?? plan?.machine_id ?? null;
        if (!machineId) continue;

        const machineRow = machineRowsMap.get(machineId);
        if (!machineRow) continue;
        if (session) continue;

        const piece = pieceById.get(pw.piece_task_id);
        const project = pw.project_id ? projectById.get(pw.project_id) : null;
        const worker = workerById.get(pw.worker_id);

        if (machineRow.display_status === "idle") {
          machineRow.display_status = "occupied";
        }
        machineRow.current_piece = piece?.name ?? null;
        machineRow.current_project = project?.name ?? null;
        machineRow.current_worker = worker?.full_name ?? null;
        machineRow.estimated_minutes =
          piece?.estimated_time_minutes ?? piece?.estimated_minutes ?? null;
      }

      // Enrich with active sessions
      for (const s of (allActiveSessions ?? []) as any[]) {
        if (!s.machine_id) continue;
        const machineRow = machineRowsMap.get(s.machine_id);
        if (!machineRow) continue;

        const piece = s.piece_task_id ? pieceById.get(s.piece_task_id) : null;
        const project = s.project_id ? projectById.get(s.project_id) : null;
        const worker = workerById.get(s.worker_id);

        const startedAt = s.started_at;
        const elapsedMin = startedAt
          ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000)
          : null;

        if (s.session_type === "production") {
          machineRow.activity = taskTypeById.get(s.task_type_id ?? "") ?? null;
          machineRow.display_status = "running";
        } else if (s.session_type === "downtime") {
          machineRow.activity = stopReasonById.get(s.stop_reason_id ?? "") ?? null;
          machineRow.display_status = "warning";
        }

        machineRow.current_piece = piece?.name ?? machineRow.current_piece;
        machineRow.current_project = project?.name ?? machineRow.current_project;
        machineRow.current_worker = worker?.full_name ?? machineRow.current_worker;
        machineRow.elapsed_minutes = elapsedMin;
        machineRow.estimated_minutes =
          piece?.estimated_time_minutes ?? piece?.estimated_minutes ?? null;
      }

      const statusOrder: Record<MachineDisplayStatus, number> = {
        running: 0,
        warning: 1,
        occupied: 2,
        idle: 3,
        maintenance: 4,
      };
      const machineRows = Array.from(machineRowsMap.values()).sort((a, b) => {
        const so = statusOrder[a.display_status] - statusOrder[b.display_status];
        if (so !== 0) return so;
        return a.code.localeCompare(b.code);
      });

      const machinesRunning = machineRows.filter(
        (m) => m.display_status === "running",
      ).length;
      const globalEfficiency =
        machinesAvailable > 0
          ? Math.round((machinesRunning / machinesAvailable) * 100)
          : 0;

      setMachines(machineRows);

      // ===== Step 6b — Build workers detail rows =====
      const workersRows: WorkerDetailRow[] = [];
      for (const shift of (openShifts ?? []) as any[]) {
        const worker = workerById.get(shift.worker_id);
        if (!worker) continue;

        const pw = pieceWorkByWorker.get(shift.worker_id);
        const plan = pw
          ? planningByKey.get(`${pw.worker_id}::${pw.piece_task_id}`)
          : null;
        const session = pw
          ? sessionByKey.get(`${pw.worker_id}::${pw.piece_task_id}`)
          : null;

        const machineId = session?.machine_id ?? plan?.machine_id ?? null;
        const machine = machineId ? machineById.get(machineId) : null;
        const piece = pw ? pieceById.get(pw.piece_task_id) : null;
        const project = pw?.project_id ? projectById.get(pw.project_id) : null;

        let activity: string | null = null;
        let sessionKind: SessionKind = "none";
        let sessionStartedAt: string | null = null;
        let elapsedMin: number | null = null;

        if (session) {
          sessionStartedAt = session.started_at;
          elapsedMin = Math.floor(
            (Date.now() - new Date(session.started_at).getTime()) / 60000,
          );
          if (session.session_type === "production") {
            activity = taskTypeById.get(session.task_type_id ?? "") ?? null;
            sessionKind = "production";
          } else if (session.session_type === "downtime") {
            activity = stopReasonById.get(session.stop_reason_id ?? "") ?? null;
            sessionKind = "downtime";
          }
        }

        workersRows.push({
          id: worker.id,
          full_name: worker.full_name ?? "—",
          current_machine_code: machine?.code ?? null,
          current_machine_name: machine?.name ?? null,
          current_project: project?.name ?? null,
          current_piece: piece?.name ?? null,
          session_kind: sessionKind,
          activity,
          session_started_at: sessionStartedAt,
          elapsed_minutes: elapsedMin,
          shift_started_at: shift.started_at,
        });
      }

      workersRows.sort((a, b) => {
        const kindOrder: Record<SessionKind, number> = {
          production: 0,
          downtime: 1,
          none: 2,
        };
        const so = kindOrder[a.session_kind] - kindOrder[b.session_kind];
        if (so !== 0) return so;
        return a.full_name.localeCompare(b.full_name);
      });

      setWorkersDetail(workersRows);

      // ===== Step 7 — OF aggregation via WPs =====
      const { data: ofData } = await supabase
        .from("manufacturing_orders")
        .select(
          "id, order_number, product_name, quantity, status, planned_end_date, project_id, projects(name)",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      const allOfs = (ofData ?? []) as any[];
      const allOfIds = allOfs.map((o) => o.id);

      const { data: wpsAllData } =
        allOfIds.length > 0
          ? await supabase
              .from("of_work_packages")
              .select("id, manufacturing_order_id, status, interface_type")
              .in("manufacturing_order_id", allOfIds)
          : { data: [] };

      const wpsByOf = new Map<string, { total: number; done: number }>();
      for (const wp of (wpsAllData ?? []) as any[]) {
        if (!wp.manufacturing_order_id) continue;
        const entry = wpsByOf.get(wp.manufacturing_order_id) ?? { total: 0, done: 0 };
        entry.total += 1;
        if (wp.status === "completed") entry.done += 1;
        wpsByOf.set(wp.manufacturing_order_id, entry);
      }

      const { data: ofPiecesData } =
        allOfIds.length > 0
          ? await supabase
              .from("pieces_tasks")
              .select("id, manufacturing_order_id")
              .eq("company_id", companyId)
              .in("manufacturing_order_id", allOfIds)
          : { data: [] };

      const pieceToOf = new Map<string, string>();
      for (const p of (ofPiecesData ?? []) as any[]) {
        if (p.manufacturing_order_id) pieceToOf.set(p.id, p.manufacturing_order_id);
      }

      const ofsWithActiveWork = new Set<string>();
      for (const s of (allActiveSessions ?? []) as any[]) {
        if (!s.piece_task_id) continue;
        const ofId = pieceToOf.get(s.piece_task_id);
        if (ofId) ofsWithActiveWork.add(ofId);
      }

      let ofInProgressCount = 0;
      let ofLateCount = 0;

      const ofList: OfRow[] = allOfs.map((o: any) => {
        const wps = wpsByOf.get(o.id) ?? { total: 0, done: 0 };
        const hasActiveWork = ofsWithActiveWork.has(o.id);
        const allWpsDone = wps.total > 0 && wps.done >= wps.total;
        const isDone = o.status === "completed" || allWpsDone;

        const deadline = o.planned_end_date ? new Date(o.planned_end_date) : null;
        const daysLeft = deadline ? daysBetween(deadline.toISOString(), now) : null;
        const isLate =
          !isDone && deadline !== null && deadline.getTime() < now.getTime();

        const progress =
          wps.total > 0 ? Math.round((wps.done / wps.total) * 100) : 0;

        let status: OfRow["status"];
        if (isDone) status = "done";
        else if (isLate) status = "late";
        else if (hasActiveWork) status = "in_progress";
        else if (wps.done > 0) status = "partial";
        else status = "pending";

        if (status === "in_progress") ofInProgressCount += 1;
        if (status === "late") ofLateCount += 1;

        return {
          id: o.id,
          number: o.order_number ?? "—",
          project_name: o.projects?.name ?? "—",
          product: o.product_name ?? "—",
          quantity: o.quantity ?? 0,
          progress,
          wps_done: wps.done,
          wps_total: wps.total,
          status,
          deadline: deadline
            ? deadline.toLocaleDateString(i18n.language, {
                day: "2-digit",
                month: "short",
              })
            : "—",
          days_left: daysLeft,
        };
      });

      const ofStatusOrder: Record<OfRow["status"], number> = {
        late: 0,
        in_progress: 1,
        partial: 2,
        pending: 3,
        done: 4,
      };
      ofList.sort((a, b) => {
        const so = ofStatusOrder[a.status] - ofStatusOrder[b.status];
        if (so !== 0) return so;
        return a.days_left === null
          ? 1
          : b.days_left === null
            ? -1
            : a.days_left - b.days_left;
      });

      setOfRows(ofList);

      // ===== Step 8 — Production chart =====
      const days: Date[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        days.push(d);
      }
      const fromIso = `${localDateStr(days[0])}T00:00:00.000Z`;
      const toIso = `${localDateStr(days[6])}T23:59:59.999Z`;

      const [{ data: prodSessions }, { data: completedPieces }] = await Promise.all([
        supabase
          .from("work_sessions")
          .select("started_at, duration_seconds")
          .eq("company_id", companyId)
          .eq("session_type", "production")
          .gte("started_at", fromIso)
          .lte("started_at", toIso)
          .is("voided_at", null),
        supabase
          .from("pieces_tasks")
          .select("completed_at")
          .eq("company_id", companyId)
          .eq("production_status", "completed")
          .gte("completed_at", fromIso)
          .lte("completed_at", toIso)
          .not("completed_at", "is", null),
      ]);

      const hoursByDay = new Map<string, number>();
      for (const s of (prodSessions ?? []) as any[]) {
        const day = (s.started_at as string).slice(0, 10);
        const secs =
          s.duration_seconds ??
          Math.max(
            0,
            Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000),
          );
        hoursByDay.set(day, (hoursByDay.get(day) ?? 0) + secs / 3600);
      }

      const piecesByDay = new Map<string, number>();
      for (const p of (completedPieces ?? []) as any[]) {
        if (!p.completed_at) continue;
        const day = (p.completed_at as string).slice(0, 10);
        piecesByDay.set(day, (piecesByDay.get(day) ?? 0) + 1);
      }

      setProduction(
        days.map((d) => {
          const iso = localDateStr(d);
          return {
            day: d.toLocaleDateString(i18n.language, {
              day: "2-digit",
              month: "short",
            }),
            hours: Math.round((hoursByDay.get(iso) ?? 0) * 10) / 10,
            pieces: piecesByDay.get(iso) ?? 0,
          };
        }),
      );

      // ===== Step 9 — Projects =====
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, name, status, clients(name)")
        .eq("company_id", companyId)
        .neq("is_archived", true)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);

      const projectIdsList = (projectsData ?? []).map((p: any) => p.id);
      const { data: projPieces } =
        projectIdsList.length > 0
          ? await supabase
              .from("pieces_tasks")
              .select("project_id, production_status, status")
              .eq("company_id", companyId)
              .in("project_id", projectIdsList)
              .neq("status", "cancelled")
          : { data: [] };

      const piecesByProject = new Map<string, { total: number; done: number }>();
      for (const p of (projPieces ?? []) as any[]) {
        if (!p.project_id) continue;
        const entry = piecesByProject.get(p.project_id) ?? { total: 0, done: 0 };
        entry.total += 1;
        if (p.production_status === "completed") entry.done += 1;
        piecesByProject.set(p.project_id, entry);
      }

      setProjects(
        (projectsData ?? []).map((p: any) => {
          const info = piecesByProject.get(p.id) ?? { total: 0, done: 0 };
          return {
            id: p.id,
            name: p.name ?? "—",
            client: p.clients?.name ?? "—",
            progress:
              info.total > 0 ? Math.round((info.done / info.total) * 100) : 0,
            piecesDone: info.done,
            piecesTotal: info.total,
          };
        }),
      );

      // ===== Step 10 — Alerts =====
      const alertList: AlertItem[] = [];

      const { data: reclamations } = await supabase
        .from("workshop_reclamations")
        .select("id, message, status, created_at, workers(full_name), machines(name)")
        .eq("company_id", companyId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(30);

      for (const r of (reclamations ?? []) as any[]) {
        alertList.push({
          id: `rec-${r.id}`,
          kind: "reclamation",
          severity: r.status === "nouveau" ? "danger" : "warning",
          title: `${r.workers?.full_name ?? "—"}${
            r.machines?.name ? ` · ${r.machines.name}` : ""
          }`,
          message: r.message,
          created_at: r.created_at,
        });
      }

      for (const o of ofList.filter((x) => x.status === "late").slice(0, 20)) {
        alertList.push({
          id: `of-${o.id}`,
          kind: "of_late",
          severity: "danger",
          title: `OF ${o.number} · ${o.product}`,
          message: `${o.project_name} — ${o.deadline}${
            o.days_left !== null && o.days_left < 0
              ? ` (${Math.abs(o.days_left)} j de retard)`
              : ""
          }`,
          created_at: new Date().toISOString(),
          pageKey: "production_dashboard",
        });
      }

      for (const s of (allActiveSessions ?? []) as any[]) {
        const hoursOpen =
          (Date.now() - new Date(s.started_at).getTime()) / (1000 * 60 * 60);
        if (hoursOpen > 8) {
          const worker = workerById.get(s.worker_id);
          const machine = s.machine_id ? machineById.get(s.machine_id) : null;
          alertList.push({
            id: `sess-${s.id}`,
            kind: "session_suspect",
            severity: "warning",
            title: `Session suspecte · ${worker?.full_name ?? "—"}`,
            message: `${machine?.name ?? "—"} — ouverte depuis ${Math.round(hoursOpen)} h`,
            created_at: s.started_at,
          });
        }
      }

      for (const m of (allMachinesData ?? []) as any[]) {
        if (m.current_status === "maintenance") {
          alertList.push({
            id: `maint-${m.id}`,
            kind: "maintenance",
            severity: "info",
            title: `Maintenance · ${m.code}`,
            message: m.name ?? "—",
            created_at: new Date().toISOString(),
          });
        }
      }

      const severityOrder: Record<AlertItem["severity"], number> = {
        danger: 0,
        warning: 1,
        info: 2,
      };
      alertList.sort((a, b) => {
        const so = severityOrder[a.severity] - severityOrder[b.severity];
        if (so !== 0) return so;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setAlerts(alertList);

      // ===== Set KPI =====
      setKpi({
        machinesRunning,
        machinesAvailable,
        machinesTotal,
        ofInProgress: ofInProgressCount,
        ofLate: ofLateCount,
        workersPresent,
        workersProductive,
        workersTotal,
        globalEfficiency,
        alertsCount: alertList.length,
      });
    } catch (err) {
      console.error("[Dashboard] load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [staffUser?.company_id, i18n.language]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load]);

  // Live updates
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
      "of_work_packages",
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

  // Render helpers
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
  // Loading state
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

  // ==========================================================================
  // DETAIL VIEWS
  // ==========================================================================
  const renderMachinesDetail = () => {
    const badgeLabel = (m: MachineRow): { variant: any; label: string } => {
      switch (m.display_status) {
        case "running":
          return {
            variant: "success",
            label:
              m.activity ||
              t("dashboard.machines.running", { defaultValue: "En production" }),
          };
        case "warning":
          return {
            variant: "warning",
            label:
              m.activity ||
              t("dashboard.machines.warning", { defaultValue: "En arrêt" }),
          };
        case "maintenance":
          return {
            variant: "danger",
            label: t("dashboard.machines.maintenance", { defaultValue: "Maintenance" }),
          };
        case "occupied":
          return {
            variant: "neutral",
            label: t("dashboard.machines.occupied", { defaultValue: "Occupée" }),
          };
        default:
          return {
            variant: "neutral",
            label: t("dashboard.machines.idle", { defaultValue: "Disponible" }),
          };
      }
    };

    return (
      <div className="space-y-5">
        <BackHeader
          title={t("dashboard.machines.detailTitle", {
            defaultValue: "État des machines",
          })}
          subtitle={t("dashboard.machines.detailSubtitle", {
            defaultValue: "Toutes les machines actives avec leur contexte complet",
          })}
          onBack={() => setView("home")}
          badge={machines.length}
          dateStr={today}
          timeStr={currentTime}
        />

        {machines.length === 0 ? (
          <EmptyState
            label={t("setup.noDataYet", { defaultValue: "Aucune machine active" })}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {machines.map((m) => {
              const badge = badgeLabel(m);
              const showProgress =
                m.elapsed_minutes !== null &&
                m.estimated_minutes !== null &&
                m.estimated_minutes > 0;
              const progressPct = showProgress
                ? Math.min(
                    100,
                    Math.round(
                      (m.elapsed_minutes! / m.estimated_minutes!) * 100,
                    ),
                  )
                : 0;

              return (
                <Card key={m.id}>
                  <CardBody>
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: "var(--bg-muted)",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        <Cog size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="truncate text-base font-bold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {m.code}
                          </span>
                          <Badge variant={badge.variant} size="sm" dot>
                            {badge.label}
                          </Badge>
                        </div>
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {m.name} · {m.model}
                        </div>
                      </div>
                    </div>

                    {(m.current_worker ||
                      m.current_project ||
                      m.current_piece) && (
                      <div
                        className="mt-3 space-y-1 rounded-lg border p-3 text-xs"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        {m.current_worker && (
                          <div className="flex justify-between gap-2">
                            <span style={{ color: "var(--text-tertiary)" }}>
                              {t("dashboard.machines.worker", {
                                defaultValue: "Opérateur",
                              })}
                            </span>
                            <span
                              className="font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {m.current_worker}
                            </span>
                          </div>
                        )}
                        {m.current_project && (
                          <div className="flex justify-between gap-2">
                            <span style={{ color: "var(--text-tertiary)" }}>
                              {t("dashboard.machines.project", {
                                defaultValue: "Projet",
                              })}
                            </span>
                            <span
                              className="truncate font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {m.current_project}
                            </span>
                          </div>
                        )}
                        {m.current_piece && (
                          <div className="flex justify-between gap-2">
                            <span style={{ color: "var(--text-tertiary)" }}>
                              {t("dashboard.machines.piece", {
                                defaultValue: "Pièce",
                              })}
                            </span>
                            <span
                              className="truncate font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {m.current_piece}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {showProgress && m.display_status !== "idle" && (
                      <div className="mt-3">
                        <div
                          className="mb-1 flex justify-between text-[11px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          <span>
                            {formatDuration(m.elapsed_minutes!)} /{" "}
                            {formatDuration(m.estimated_minutes!)}
                          </span>
                          <span>{progressPct}%</span>
                        </div>
                        <ProgressBar
                          value={progressPct}
                          color={
                            m.display_status === "warning" ? "orange" : "green"
                          }
                          size="xs"
                        />
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderOperatorsDetail = () => {
    const kindBadge = (k: SessionKind): { variant: any; label: string } => {
      switch (k) {
        case "production":
          return {
            variant: "success",
            label: t("dashboard.machines.running", { defaultValue: "En production" }),
          };
        case "downtime":
          return {
            variant: "warning",
            label: t("dashboard.machines.warning", { defaultValue: "En arrêt" }),
          };
        default:
          return {
            variant: "neutral",
            label: t("dashboard.operators.idle", { defaultValue: "Sans activité" }),
          };
      }
    };

    return (
      <div className="space-y-5">
        <BackHeader
          title={t("dashboard.operators.detailTitle", {
            defaultValue: "Opérateurs",
          })}
          subtitle={t("dashboard.operators.detailSubtitle", {
            defaultValue: "Tous les opérateurs actuellement connectés",
          })}
          onBack={() => setView("home")}
          badge={workersDetail.length}
          dateStr={today}
          timeStr={currentTime}
        />

        {workersDetail.length === 0 ? (
          <EmptyState
            label={t("dashboard.operators.empty", {
              defaultValue: "Aucun opérateur connecté pour le moment",
            })}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {workersDetail.map((w) => {
              const badge = kindBadge(w.session_kind);
              const initials = w.full_name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();

              return (
                <Card key={w.id}>
                  <CardBody>
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: "var(--brand-orange)" }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="truncate text-base font-bold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {w.full_name}
                          </span>
                          <Badge variant={badge.variant} size="sm" dot>
                            {badge.label}
                          </Badge>
                        </div>
                        {w.current_machine_code && (
                          <div
                            className="truncate text-xs"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {w.current_machine_code}
                            {w.current_machine_name
                              ? ` · ${w.current_machine_name}`
                              : ""}
                          </div>
                        )}
                      </div>
                    </div>

                    {(w.current_project ||
                      w.current_piece ||
                      w.activity) && (
                      <div
                        className="mt-3 space-y-1 rounded-lg border p-3 text-xs"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        {w.current_project && (
                          <div className="flex justify-between gap-2">
                            <span style={{ color: "var(--text-tertiary)" }}>
                              {t("dashboard.machines.project", {
                                defaultValue: "Projet",
                              })}
                            </span>
                            <span
                              className="truncate font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {w.current_project}
                            </span>
                          </div>
                        )}
                        {w.current_piece && (
                          <div className="flex justify-between gap-2">
                            <span style={{ color: "var(--text-tertiary)" }}>
                              {t("dashboard.machines.piece", {
                                defaultValue: "Pièce",
                              })}
                            </span>
                            <span
                              className="truncate font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {w.current_piece}
                            </span>
                          </div>
                        )}
                        {w.activity && (
                          <div className="flex justify-between gap-2">
                            <span style={{ color: "var(--text-tertiary)" }}>
                              {t("dashboard.machines.activity", {
                                defaultValue: "Activité",
                              })}
                            </span>
                            <span
                              className="truncate font-semibold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {w.activity}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      className="mt-3 flex justify-between text-[11px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {w.elapsed_minutes !== null && (
                        <span>
                          {t("dashboard.operators.sessionDuration", {
                            defaultValue: "Session",
                          })}
                          : {formatDuration(w.elapsed_minutes)}
                        </span>
                      )}
                      <span>
                        {t("dashboard.operators.shift", { defaultValue: "Shift" })}
                        : {timeAgo(w.shift_started_at, i18n.language)}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderOfDetail = () => {
    return (
      <div className="space-y-5">
        <BackHeader
          title={t("dashboard.of.detailTitle", {
            defaultValue: "Ordres de fabrication",
          })}
          subtitle={t("dashboard.of.detailSubtitle", {
            defaultValue: "Tous les ordres de fabrication avec leur progression réelle",
          })}
          onBack={() => setView("home")}
          badge={ofRows.length}
          dateStr={today}
          timeStr={currentTime}
        />

        <Card>
          <CardBody className="!px-0 !pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {[
                      t("dashboard.of.colNumber", { defaultValue: "N° OF" }),
                      t("dashboard.of.colProject", { defaultValue: "Projet" }),
                      t("dashboard.of.colProduct", { defaultValue: "Produit" }),
                      t("dashboard.of.colQty", { defaultValue: "Qté" }),
                      t("dashboard.of.colProgress", { defaultValue: "Progression" }),
                      t("dashboard.of.colStatus", { defaultValue: "Statut" }),
                      t("dashboard.of.colDeadline", { defaultValue: "Échéance" }),
                    ].map((label, i) => (
                      <th
                        key={i}
                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ofRows.map((of) => {
                    const wpIncomplete = of.wps_total < 2;
                    return (
                      <tr
                        key={of.id}
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                of.status === "done"
                                  ? "bg-blue-500"
                                  : of.status === "late"
                                    ? "bg-red-500"
                                    : of.status === "in_progress"
                                      ? "bg-emerald-500"
                                      : of.status === "partial"
                                        ? "bg-amber-500"
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
                          {of.project_name}
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
                          <div className="flex min-w-[110px] items-center gap-2">
                            <div className="flex-1">
                              <ProgressBar value={of.progress} size="xs" />
                            </div>
                            {wpIncomplete && (
                              <span
                                title={t("dashboard.of.wpIncompleteHint", {
                                  defaultValue:
                                    "Work packages incomplets (attendu : cnc + classique)",
                                })}
                                className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold leading-none text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                              >
                                !
                              </span>
                            )}
                          </div>
                          <span
                            className="mt-0.5 block text-[10px]"
                            style={{ color: "var(--text-tertiary)" }}
                            dir="ltr"
                          >
                            {of.wps_done}/{of.wps_total}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant={
                              of.status === "done"
                                ? "info"
                                : of.status === "late"
                                  ? "danger"
                                  : of.status === "in_progress"
                                    ? "success"
                                    : of.status === "partial"
                                      ? "warning"
                                      : "neutral"
                            }
                            size="sm"
                            dot
                          >
                            {of.status === "done"
                              ? t("dashboard.of.done", { defaultValue: "Terminée" })
                              : of.status === "late"
                                ? t("dashboard.of.late", {
                                    defaultValue: "En retard",
                                  })
                                : of.status === "in_progress"
                                  ? t("dashboard.of.inProgress", {
                                      defaultValue: "En cours",
                                    })
                                  : of.status === "partial"
                                    ? t("dashboard.of.partial", {
                                        defaultValue: "Partiel",
                                      })
                                    : t("dashboard.of.pending", {
                                        defaultValue: "En attente",
                                      })}
                          </Badge>
                        </td>
                        <td
                          className="px-4 py-3 text-xs"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          <span dir="ltr">{of.deadline}</span>
                          {of.days_left !== null && of.status !== "done" && (
                            <span
                              className="mt-0.5 block text-[10px]"
                              style={{
                                color:
                                  of.days_left < 0
                                    ? "#ef4444"
                                    : of.days_left <= 2
                                      ? "#f59e0b"
                                      : "var(--text-tertiary)",
                              }}
                              dir="ltr"
                            >
                              {of.days_left < 0
                                ? `${Math.abs(of.days_left)} j`
                                : `${of.days_left} j`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
      </div>
    );
  };

  const renderProjectsDetail = () => {
    return (
      <div className="space-y-5">
        <BackHeader
          title={t("dashboard.projects.detailTitle", {
            defaultValue: "Projets en cours",
          })}
          subtitle={t("dashboard.projects.detailSubtitle", {
            defaultValue: "Tous les projets actifs avec leur avancement",
          })}
          onBack={() => setView("home")}
          badge={projects.length}
          dateStr={today}
          timeStr={currentTime}
        />

        {projects.length === 0 ? (
          <EmptyState
            label={t("setup.noDataYet", { defaultValue: "Aucun projet en cours" })}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <Card key={p.id}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-muted)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      <Package size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-base font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {p.name}
                      </div>
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {p.client}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div
                      className="mb-1 flex justify-between text-[11px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <span>
                        {p.piecesDone}/{p.piecesTotal}{" "}
                        {t("dashboard.projects.piecesShort", {
                          defaultValue: "pièces",
                        })}
                      </span>
                      <span className="font-bold">{p.progress}%</span>
                    </div>
                    <ProgressBar value={p.progress} size="sm" />
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAlertsDetail = () => {
    const grouped = {
      danger: alerts.filter((a) => a.severity === "danger"),
      warning: alerts.filter((a) => a.severity === "warning"),
      info: alerts.filter((a) => a.severity === "info"),
    };

    const renderGroup = (
      items: AlertItem[],
      titleKey: string,
      defaultTitle: string,
      color: string,
      bg: string,
    ) => {
      if (items.length === 0) return null;
      return (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold"
                style={{ backgroundColor: bg, color }}
              >
                {items.length}
              </span>
              <CardTitle size="md">
                {t(titleKey, { defaultValue: defaultTitle })}
              </CardTitle>
            </div>
          </CardHeader>
          <CardBody className="!px-0 !pb-2">
            <ul>
              {items.map((a, idx) => {
                const IconComp =
                  a.kind === "reclamation"
                    ? Bell
                    : a.kind === "of_late"
                      ? AlertCircle
                      : a.kind === "session_suspect"
                        ? Timer
                        : a.kind === "maintenance"
                          ? Wrench
                          : FileText;
                return (
                  <li
                    key={a.id}
                    style={{
                      borderTop:
                        idx > 0 ? "1px solid var(--border-subtle)" : "none",
                    }}
                  >
                    <div className="flex items-start gap-3 px-5 py-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: bg, color }}
                      >
                        <IconComp size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {a.title}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {a.message}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-[11px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {timeAgo(a.created_at, i18n.language)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      );
    };

    return (
      <div className="space-y-5">
        <BackHeader
          title={t("dashboard.alerts.detailTitle", { defaultValue: "Alertes" })}
          subtitle={t("dashboard.alerts.detailSubtitle", {
            defaultValue: "Toutes les alertes actives, classées par gravité",
          })}
          onBack={() => setView("home")}
          badge={alerts.length}
          dateStr={today}
          timeStr={currentTime}
        />

        {alerts.length === 0 ? (
          <EmptyState
            label={t("dashboard.alerts.empty", {
              defaultValue: "Aucune alerte — tout est sous contrôle.",
            })}
          />
        ) : (
          <div className="space-y-4">
            {renderGroup(
              grouped.danger,
              "dashboard.alerts.groupDanger",
              "Critiques",
              "#ef4444",
              "rgba(239, 68, 68, 0.12)",
            )}
            {renderGroup(
              grouped.warning,
              "dashboard.alerts.groupWarning",
              "Avertissements",
              "#f59e0b",
              "rgba(245, 158, 11, 0.12)",
            )}
            {renderGroup(
              grouped.info,
              "dashboard.alerts.groupInfo",
              "Informations",
              "#3b82f6",
              "rgba(59, 130, 246, 0.12)",
            )}
          </div>
        )}
      </div>
    );
  };

  // ==========================================================================
  // ROUTE
  // ==========================================================================
  if (view === "machines") return renderMachinesDetail();
  if (view === "operators") return renderOperatorsDetail();
  if (view === "of") return renderOfDetail();
  if (view === "projects") return renderProjectsDetail();
  if (view === "alerts") return renderAlertsDetail();

  // ==========================================================================
  // HOME VIEW
  // ==========================================================================
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div onClick={() => setView("machines")} className="cursor-pointer">
          <KpiCard
            icon={<Monitor size={20} />}
            iconColor="blue"
            label={t("dashboard.kpi.machinesRunning", {
              defaultValue: "Machines en production",
            })}
            value={kpi.machinesRunning}
            total={kpi.machinesAvailable}
            progress={
              kpi.machinesAvailable > 0
                ? Math.round((kpi.machinesRunning / kpi.machinesAvailable) * 100)
                : 0
            }
            progressColor="green"
            caption={
              kpi.machinesTotal > kpi.machinesAvailable
                ? `${kpi.machinesTotal - kpi.machinesAvailable} ${t(
                    "dashboard.kpi.inMaintenance",
                    { defaultValue: "en maintenance" },
                  )}`
                : undefined
            }
          />
        </div>

        <div onClick={() => setView("operators")} className="cursor-pointer">
          <KpiCard
            icon={<Users size={20} />}
            iconColor="purple"
            label={t("dashboard.kpi.workersActive", {
              defaultValue: "Opérateurs présents",
            })}
            value={kpi.workersPresent}
            total={kpi.workersTotal}
            progress={
              kpi.workersTotal > 0
                ? Math.round((kpi.workersPresent / kpi.workersTotal) * 100)
                : 0
            }
            progressColor="purple"
            caption={
              kpi.workersProductive > 0
                ? `${kpi.workersProductive} ${t("dashboard.kpi.inProduction", {
                    defaultValue: "en production",
                  })}`
                : undefined
            }
          />
        </div>

        <div onClick={() => setView("of")} className="cursor-pointer">
          <KpiCard
            icon={<Package size={20} />}
            iconColor="green"
            label={t("dashboard.kpi.ofInProgress", {
              defaultValue: "Ordres de fabrication",
            })}
            value={kpi.ofInProgress}
            caption={
              kpi.ofLate > 0
                ? `${kpi.ofLate} ${t("dashboard.kpi.ofLate", {
                    defaultValue: "en retard",
                  })}`
                : undefined
            }
          />
        </div>

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

        <div onClick={() => setView("alerts")} className="cursor-pointer">
          <KpiCard
            icon={<Bell size={20} />}
            iconColor={kpi.alertsCount > 0 ? "orange" : "green"}
            label={t("dashboard.kpi.alertsActive", {
              defaultValue: "Alertes actives",
            })}
            value={kpi.alertsCount}
            caption={
              kpi.alertsCount === 0
                ? t("dashboard.kpi.allClear", { defaultValue: "Tout est calme" })
                : undefined
            }
          />
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Chart */}
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
                {t("dashboard.production.legendHours", {
                  defaultValue: "Heures de production",
                })}
              </span>
              <span
                className="inline-flex items-center gap-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: "#f97316" }}
                />
                {t("dashboard.production.legendPieces", {
                  defaultValue: "Pièces terminées",
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
                    yAxisId="left"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
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
                    yAxisId="left"
                    dataKey="hours"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="pieces"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Machines (compact) */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.machines.title", {
                defaultValue: "État des machines",
              })}
            </CardTitle>
            <CardAction>
              <button
                type="button"
                onClick={() => setView("machines")}
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--accent-blue)" }}
              >
                {t("common.viewAll", { defaultValue: "Voir tout →" })}
              </button>
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <ul className="max-h-[340px] overflow-y-auto">
              {machines.slice(0, 8).map((m, idx) => {
                const badgeVariant =
                  m.display_status === "running"
                    ? "success"
                    : m.display_status === "warning"
                      ? "warning"
                      : m.display_status === "maintenance"
                        ? "danger"
                        : "neutral";
                const badgeLabel =
                  m.display_status === "running"
                    ? m.activity ||
                      t("dashboard.machines.running", { defaultValue: "En production" })
                    : m.display_status === "warning"
                      ? m.activity ||
                        t("dashboard.machines.warning", { defaultValue: "En arrêt" })
                      : m.display_status === "maintenance"
                        ? t("dashboard.machines.maintenance", {
                            defaultValue: "Maintenance",
                          })
                        : m.display_status === "occupied"
                          ? t("dashboard.machines.occupied", {
                              defaultValue: "Occupée",
                            })
                          : t("dashboard.machines.idle", {
                              defaultValue: "Disponible",
                            });

                const hasContext =
                  m.current_project || m.current_piece || m.current_worker;
                const showProgress =
                  m.elapsed_minutes !== null &&
                  m.estimated_minutes !== null &&
                  m.estimated_minutes > 0;
                const progressPct = showProgress
                  ? Math.min(
                      100,
                      Math.round(
                        (m.elapsed_minutes! / m.estimated_minutes!) * 100,
                      ),
                    )
                  : 0;

                return (
                  <li
                    key={m.id}
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
                      {hasContext && (
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
                      {showProgress && m.display_status !== "idle" && (
                        <div className="mt-1.5">
                          <ProgressBar
                            value={progressPct}
                            color={
                              m.display_status === "warning" ? "orange" : "green"
                            }
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

        {/* Alerts (compact) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.alerts.title", { defaultValue: "Alertes" })}
            </CardTitle>
            <CardAction>
              <button
                type="button"
                onClick={() => setView("alerts")}
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--accent-blue)" }}
              >
                {kpi.alertsCount > 0
                  ? t("common.viewAll", { defaultValue: "Voir tout →" })
                  : ""}
              </button>
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-2">
            <ul className="max-h-[340px] space-y-1 overflow-y-auto">
              {alerts.length === 0 && (
                <li
                  className="px-5 py-6 text-center text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {t("dashboard.alerts.empty", {
                    defaultValue: "Aucune alerte — tout est sous contrôle.",
                  })}
                </li>
              )}
              {alerts.slice(0, 6).map((a) => {
                const IconComp =
                  a.kind === "reclamation"
                    ? Bell
                    : a.kind === "of_late"
                      ? AlertCircle
                      : a.kind === "session_suspect"
                        ? Timer
                        : a.kind === "maintenance"
                          ? Wrench
                          : FileText;

                const iconBg =
                  a.severity === "danger"
                    ? "rgba(239, 68, 68, 0.12)"
                    : a.severity === "warning"
                      ? "rgba(245, 158, 11, 0.12)"
                      : "rgba(59, 130, 246, 0.12)";

                const iconColor =
                  a.severity === "danger"
                    ? "#ef4444"
                    : a.severity === "warning"
                      ? "#f59e0b"
                      : "#3b82f6";

                return (
                  <li key={a.id}>
                    <div className="flex items-start gap-3 px-5 py-2.5">
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
                          {a.title}
                        </p>
                        <p
                          className="line-clamp-2 text-[11px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {a.message}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-[10px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {timeAgo(a.created_at, i18n.language)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* SECOND GRID */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* OF (compact) */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.of.title", { defaultValue: "Ordres de fabrication" })}
            </CardTitle>
            <CardAction>
              <button
                type="button"
                onClick={() => setView("of")}
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--accent-blue)" }}
              >
                {t("common.viewAll", { defaultValue: "Voir tout →" })}
              </button>
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {[
                      t("dashboard.of.colNumber", { defaultValue: "N° OF" }),
                      t("dashboard.of.colProject", { defaultValue: "Projet" }),
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
                  {ofRows.slice(0, 8).map((of) => {
                    const wpIncomplete = of.wps_total < 2;
                    return (
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
                                  : of.status === "late"
                                    ? "bg-red-500"
                                    : of.status === "in_progress"
                                      ? "bg-emerald-500"
                                      : of.status === "partial"
                                        ? "bg-amber-500"
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
                          {of.project_name}
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
                          <div className="flex min-w-[110px] items-center gap-2">
                            <div className="flex-1">
                              <ProgressBar value={of.progress} size="xs" />
                            </div>
                            {wpIncomplete && (
                              <span
                                title={t("dashboard.of.wpIncompleteHint", {
                                  defaultValue:
                                    "Work packages incomplets (attendu : cnc + classique)",
                                })}
                                className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold leading-none text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                              >
                                !
                              </span>
                            )}
                          </div>
                          <span
                            className="mt-0.5 block text-[10px]"
                            style={{ color: "var(--text-tertiary)" }}
                            dir="ltr"
                          >
                            {of.wps_done}/{of.wps_total}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant={
                              of.status === "done"
                                ? "info"
                                : of.status === "late"
                                  ? "danger"
                                  : of.status === "in_progress"
                                    ? "success"
                                    : of.status === "partial"
                                      ? "warning"
                                      : "neutral"
                            }
                            size="sm"
                            dot
                          >
                            {of.status === "done"
                              ? t("dashboard.of.done", { defaultValue: "Terminée" })
                              : of.status === "late"
                                ? t("dashboard.of.late", {
                                    defaultValue: "En retard",
                                  })
                                : of.status === "in_progress"
                                  ? t("dashboard.of.inProgress", {
                                      defaultValue: "En cours",
                                    })
                                  : of.status === "partial"
                                    ? t("dashboard.of.partial", {
                                        defaultValue: "Partiel",
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
                          <span dir="ltr">{of.deadline}</span>
                          {of.days_left !== null && of.status !== "done" && (
                            <span
                              className="mt-0.5 block text-[10px]"
                              style={{
                                color:
                                  of.days_left < 0
                                    ? "#ef4444"
                                    : of.days_left <= 2
                                      ? "#f59e0b"
                                      : "var(--text-tertiary)",
                              }}
                              dir="ltr"
                            >
                              {of.days_left < 0
                                ? `${Math.abs(of.days_left)} j`
                                : `${of.days_left} j`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

        {/* Projects (compact) */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.projects.title", { defaultValue: "Projets en cours" })}
            </CardTitle>
            <CardAction>
              <button
                type="button"
                onClick={() => setView("projects")}
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--accent-blue)" }}
              >
                {t("common.viewAll", { defaultValue: "Voir tout →" })}
              </button>
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <ul className="max-h-[340px] overflow-y-auto">
              {projects.slice(0, 6).map((p, idx) => (
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
                      {p.piecesDone}/{p.piecesTotal}
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