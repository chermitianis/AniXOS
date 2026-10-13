import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Monitor,
  Package,
  Users,
  TrendingUp,
  ArrowRight,
  Calendar,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Cog,
  Wrench,
  Bell,
  Timer,
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
type MachineDisplayStatus = "running" | "warning" | "occupied" | "idle" | "maintenance";

interface MachineRow {
  id: string;
  code: string;
  name: string;
  model: string;
  current_piece: string | null;
  current_project: string | null;
  current_worker: string | null;
  activity: string | null;
  session_kind: SessionKind;
  display_status: MachineDisplayStatus;
  elapsed_minutes: number | null;
  estimated_minutes: number | null;
}

interface AlertItem {
  id: string;
  kind: "reclamation" | "of_late" | "session_suspect" | "maintenance";
  severity: "danger" | "warning" | "info";
  title: string;
  message: string;
  created_at: string;
  link: string;
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
  pieces_done: number;
  pieces_total: number;
  status: "done" | "in_progress" | "late" | "pending";
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
  deadline: string;
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

// ============================================================================
// Component
// ============================================================================
export function ManagerDashboardPage() {
  const { t, i18n } = useTranslation();
  const { staffUser } = useStaffAuth();

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
      const todayStr = localDateStr(now);

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
                "id, name, code, quantity, estimated_time_minutes, estimated_minutes, manufacturing_order_id, project_id, production_status, status",
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

      // ===== Step 6 — Build machine rows (ALL active machines) =====
      const machineRowsMap = new Map<string, MachineRow>();

      // Pre-seed with all active machines
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
          session_kind: "none",
          display_status: m.current_status === "maintenance" ? "maintenance" : "idle",
          elapsed_minutes: null,
          estimated_minutes: null,
        });
      }

      // Enrich with worker context (via work_shifts + piece_work + planning)
      for (const pw of currentPieces as any[]) {
        const key = `${pw.worker_id}::${pw.piece_task_id}`;
        const plan = planningByKey.get(key);
        const session = sessionByKey.get(key);

        const machineId = session?.machine_id ?? plan?.machine_id ?? null;
        if (!machineId) continue;

        const machineRow = machineRowsMap.get(machineId);
        if (!machineRow) continue;

        // Skip if this machine already has a session row (handled in next loop)
        if (session) continue;

        const piece = pieceById.get(pw.piece_task_id);
        const project = pw.project_id ? projectById.get(pw.project_id) : null;
        const worker = workerById.get(pw.worker_id);

        // Only mark as "occupied" if not already running
        if (machineRow.display_status === "idle") {
          machineRow.display_status = "occupied";
        }
        machineRow.current_piece = piece?.name ?? null;
        machineRow.current_project = project?.name ?? null;
        machineRow.current_worker = worker?.full_name ?? null;
        machineRow.estimated_minutes =
          piece?.estimated_time_minutes ?? piece?.estimated_minutes ?? null;
      }

      // Enrich with active sessions (highest priority)
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
          machineRow.session_kind = "production";
          machineRow.activity = taskTypeById.get(s.task_type_id ?? "") ?? null;
          machineRow.display_status = "running";
        } else if (s.session_type === "downtime") {
          machineRow.session_kind = "downtime";
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

      // Sort: running > warning > occupied > idle > maintenance, then by code
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

      // ===== Step 7 — OF aggregation =====
      const { data: ofData } = await supabase
        .from("manufacturing_orders")
        .select(
          "id, order_number, product_name, quantity, status, planned_end_date, project_id, projects(name)",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      const allOfs = (ofData ?? []) as any[];
      const allOfIds = allOfs.map((o) => o.id);

      // Fetch all pieces of all OFs
      const { data: ofPiecesData } =
        allOfIds.length > 0
          ? await supabase
              .from("pieces_tasks")
              .select("id, manufacturing_order_id, production_status")
              .eq("company_id", companyId)
              .in("manufacturing_order_id", allOfIds)
          : { data: [] };

      const piecesByOf = new Map<string, { total: number; done: number }>();
      for (const p of (ofPiecesData ?? []) as any[]) {
        if (!p.manufacturing_order_id) continue;
        const entry = piecesByOf.get(p.manufacturing_order_id) ?? {
          total: 0,
          done: 0,
        };
        entry.total += 1;
        if (p.production_status === "completed") entry.done += 1;
        piecesByOf.set(p.manufacturing_order_id, entry);
      }

      // Identify OFs with active work (session open)
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
        const pieces = piecesByOf.get(o.id) ?? { total: 0, done: 0 };
        const hasActiveWork = ofsWithActiveWork.has(o.id);
        const isDone = o.status === "completed";
        const deadline = o.planned_end_date
          ? new Date(o.planned_end_date)
          : null;
        const daysLeft = deadline ? daysBetween(deadline.toISOString(), now) : null;
        const isLate =
          !isDone && deadline !== null && deadline.getTime() < now.getTime();

        let progress = 0;
        if (pieces.total > 0) {
          progress = Math.round((pieces.done / pieces.total) * 100);
        } else if (isDone) {
          progress = 100;
        }

        let status: OfRow["status"] = "pending";
        if (isDone) status = "done";
        else if (isLate) status = "late";
        else if (hasActiveWork || o.status === "in_progress") status = "in_progress";

        if (status === "in_progress") ofInProgressCount += 1;
        if (status === "late") ofLateCount += 1;

        return {
          id: o.id,
          number: o.order_number ?? "—",
          project_name: o.projects?.name ?? "—",
          product: o.product_name ?? "—",
          quantity: o.quantity ?? 0,
          progress,
          pieces_done: pieces.done,
          pieces_total: pieces.total,
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

      // Sort: late first, then in_progress, then pending, then done
      const ofStatusOrder: Record<OfRow["status"], number> = {
        late: 0,
        in_progress: 1,
        pending: 2,
        done: 3,
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

      setOfRows(ofList.slice(0, 8));

      // ===== Step 8 — Production chart (7 days) =====
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
            Math.floor(
              (Date.now() - new Date(s.started_at).getTime()) / 1000,
            ),
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
        .select("id, name, status, planned_end_date, clients(name)")
        .eq("company_id", companyId)
        .neq("is_archived", true)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(6);

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

      const piecesByProject = new Map<
        string,
        { total: number; done: number }
      >();
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
            deadline: p.planned_end_date
              ? new Date(p.planned_end_date).toLocaleDateString(i18n.language, {
                  day: "2-digit",
                  month: "short",
                })
              : "—",
          };
        }),
      );

      // ===== Step 10 — Alerts =====
      const alertList: AlertItem[] = [];

      // 10a. Réclamations non lues
      const { data: reclamations } = await supabase
        .from("workshop_reclamations")
        .select("id, message, status, created_at, workers(full_name), machines(name)")
        .eq("company_id", companyId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(10);

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
          link: "/reclamations",
        });
      }

      // 10b. OF en retard
      for (const o of ofList.filter((x) => x.status === "late").slice(0, 5)) {
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
          link: "/manufacturing_orders",
        });
      }

      // 10c. Sessions suspectes (> 8h ouvertes)
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
            link: "/production-reports/daily",
          });
        }
      }

      // 10d. Machines en maintenance
      for (const m of (allMachinesData ?? []) as any[]) {
        if (m.current_status === "maintenance") {
          alertList.push({
            id: `maint-${m.id}`,
            kind: "maintenance",
            severity: "info",
            title: `Maintenance · ${m.code}`,
            message: m.name ?? "—",
            created_at: new Date().toISOString(),
            link: "/machines",
          });
        }
      }

      // Sort alerts: danger first, then warning, then info
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
  // Helpers (render)
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

      {/* ============================================================ */}
      {/* KPI ROW                                                      */}
      {/* ============================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Machines en production */}
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
        />

        {/* Opérateurs */}
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
        />

        {/* OF */}
        <KpiCard
          icon={<Package size={20} />}
          iconColor="green"
          label={t("dashboard.kpi.ofInProgress", {
            defaultValue: "Ordres de fabrication",
          })}
          value={kpi.ofInProgress}
          caption={
            kpi.ofLate > 0
              ? `${kpi.ofLate} ${t("dashboard.kpi.ofLate", { defaultValue: "en retard" })}`
              : undefined
          }
        />

        {/* Rendement global */}
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

        {/* Alertes */}
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

      {/* ============================================================ */}
      {/* MAIN GRID : Chart + Machines + Alerts                        */}
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
                  style={{ backgroundColor: "var(--brand-orange, #f97316)" }}
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

        {/* Machines status */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.machines.title", {
                defaultValue: "État des machines",
              })}
            </CardTitle>
            <CardAction>
              <Link
                to="/machines"
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--accent-blue)" }}
              >
                {t("common.viewAll", { defaultValue: "Voir tout →" })}
              </Link>
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
                  m.elapsed_minutes !== null && m.estimated_minutes !== null;
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

        {/* Alerts */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.alerts.title", { defaultValue: "Alertes" })}
            </CardTitle>
            {kpi.alertsCount > 0 && (
              <CardAction>
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300"
                >
                  {kpi.alertsCount}
                </span>
              </CardAction>
            )}
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
              {alerts.slice(0, 8).map((a) => {
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
                    <Link
                      to={a.link}
                      className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--bg-muted)]"
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* ============================================================ */}
      {/* SECOND GRID : OF + Projects                                  */}
      {/* ============================================================ */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* OF Table */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle size="md">
              {t("dashboard.of.title", { defaultValue: "Ordres de fabrication" })}
            </CardTitle>
            <CardAction>
              <Link
                to="/manufacturing_orders"
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--accent-blue)" }}
              >
                {t("common.viewAll", { defaultValue: "Voir tout →" })}
              </Link>
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
                                : of.status === "late"
                                  ? "bg-red-500"
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
                        <div className="min-w-[100px]">
                          <ProgressBar value={of.progress} size="xs" />
                          {of.pieces_total > 0 && (
                            <span
                              className="mt-0.5 block text-[10px]"
                              style={{ color: "var(--text-tertiary)" }}
                              dir="ltr"
                            >
                              {of.pieces_done}/{of.pieces_total}
                            </span>
                          )}
                        </div>
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
                                  : "neutral"
                          }
                          size="sm"
                          dot
                        >
                          {of.status === "done"
                            ? t("dashboard.of.done", { defaultValue: "Terminée" })
                            : of.status === "late"
                              ? t("dashboard.of.late", { defaultValue: "En retard" })
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
              <Link
                to="/projects"
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--accent-blue)" }}
              >
                {t("common.viewAll", { defaultValue: "Voir tout →" })}
              </Link>
            </CardAction>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <ul className="max-h-[340px] overflow-y-auto">
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
                      {p.client} · <span dir="ltr">{p.deadline}</span>
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