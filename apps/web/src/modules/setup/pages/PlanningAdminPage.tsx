import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Factory, Calendar, User, Clock, CheckCircle2,
  AlertTriangle, Cpu, Wrench, XCircle, ChevronLeft, ChevronRight,
  GripVertical, Layers, Circle,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  getWorkSettings,
  getShiftStartTime,
  getShiftEndTime,
  getShiftsPerDay,
  type WorkSettings,
} from "../../../shared/api/companyWorkSettingsApi";
import type { InterfaceType } from "../../../shared/types/database";

// ============================================================================
// Types locaux
// ============================================================================
type Iface = "cnc" | "classique";

interface OfReadyForPlan {
  of_id: string;
  of_number: string;
  product_name: string;
  quantity: number;
  project_id: string;
  project_name: string;
  project_code: string;
  piece_task_id: string | null;
  piece_code: string | null;
  piece_name: string | null;
  work_packages: {
    wp_id: string;
    interface_type: Iface;
    label: string | null;
  }[];
}

interface MachineRow {
  id: string;
  name: string;
  code: string | null;
  interface_type: InterfaceType;
}

interface WorkerRow {
  id: string;
  full_name: string;
  interface_type: InterfaceType;
}

interface PlanningCard {
  planning_id: string;
  of_work_package_id: string;
  manufacturing_order_id: string | null;
  piece_task_id: string | null;
  project_id: string | null;   // ✅ NEW
  machine_id: string | null;
  worker_id: string;
  planned_date: string;
  shift_number: number;
  status: string;
  of_number: string | null;
  product_name: string | null;
  piece_name: string | null;
  worker_name: string | null;
  wp_interface: Iface | null;
}

interface DragPayload {
  of_id: string;
  of_number: string;
  wp_id: string;
  wp_interface: Iface;
  product_name: string;
  piece_task_id: string | null;
  project_id: string | null;   // ✅ NEW
}

interface PendingDrop {
  payload: DragPayload;
  machine: MachineRow;
  day: Date;
  shiftNumber: number;
  candidateWorkers: WorkerRow[];
  busyWorkerIds: Set<string>;
  piece_task_id: string | null;
  project_id: string | null;   // ✅ NEW
}

// ============================================================================
// Helpers
// ============================================================================
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function machineMatchesIface(mIface: InterfaceType | string | null, required: Iface): boolean {
  if (!mIface) return false;
  if (mIface === "both") return true;
  return mIface === required;
}

function ifaceBadgeClass(iface: Iface): string {
  return iface === "cnc"
    ? "bg-amber-100 text-amber-800"
    : "bg-blue-100 text-blue-700";
}

// ============================================================================
// Composant principal
// ============================================================================
export function PlanningAdminPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [settings, setSettings] = useState<WorkSettings | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [ifaceFilter, setIfaceFilter] = useState<"all" | Iface>("all");
  const [machineFilter, setMachineFilter] = useState<string>("");

  const [ofsReady, setOfsReady] = useState<OfReadyForPlan[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [entries, setEntries] = useState<PlanningCard[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const dragDataRef = useRef<DragPayload | null>(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) days.push(addDays(weekStart, i));
    return days;
  }, [weekStart]);

  const workingDaysSet = useMemo(
    () => new Set(settings?.working_days ?? [1, 2, 3, 4, 5, 6]),
    [settings],
  );

  // -----------------------------------------------------------------------
  // Chargement
  // -----------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const ws = await getWorkSettings(companyId);
      setSettings(ws);

      const { data: machData } = await supabase
        .from("machines")
        .select("id, name, code, interface_type")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      setMachines((machData as MachineRow[]) ?? []);

      const { data: workersData } = await supabase
        .from("workers")
        .select("id, full_name, interface_type")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("full_name");
      setWorkers((workersData as WorkerRow[]) ?? []);

      const { data: ofsData, error: ofsErr } = await supabase
        .from("manufacturing_orders")
        .select("id, order_number, product_name, quantity, project_id, piece_task_id, status, projects(name, code)")
        .eq("company_id", companyId)
        .in("status", ["ready", "scheduled", "in_progress"])
        .order("prepared_at", { ascending: false });
      if (ofsErr) throw ofsErr;

      const ofs = (ofsData ?? []) as Array<{
        id: string;
        order_number: string;
        product_name: string;
        quantity: number;
        project_id: string;
        piece_task_id: string | null;
        status: string;
        projects: { name?: string; code?: string } | null;
      }>;

      const ofIds = ofs.map((o) => o.id);

      const { data: wpsData } = ofIds.length > 0
        ? await supabase
            .from("of_work_packages")
            .select("id, manufacturing_order_id, interface_type, label, status")
            .eq("company_id", companyId)
            .in("manufacturing_order_id", ofIds)
        : { data: [] };

      const wps = (wpsData ?? []) as Array<{
        id: string;
        manufacturing_order_id: string;
        interface_type: Iface;
        label: string | null;
        status: string;
      }>;

      const { data: plannedData } = await supabase
        .from("planning")
        .select("of_work_package_id")
        .eq("company_id", companyId)
        .in("status", ["scheduled", "running", "paused"]);
      const plannedWpIds = new Set(
        ((plannedData ?? []) as { of_work_package_id: string | null }[])
          .map((p) => p.of_work_package_id)
          .filter((x): x is string => !!x),
      );

      const pieceIds = ofs.map((o) => o.piece_task_id).filter((x): x is string => !!x);
      const piecesMap = new Map<string, { code: string | null; name: string }>();
      if (pieceIds.length > 0) {
        const { data: piecesData } = await supabase
          .from("pieces_tasks")
          .select("id, code, name")
          .eq("company_id", companyId)
          .in("id", pieceIds);
        for (const p of (piecesData ?? []) as { id: string; code: string | null; name: string }[]) {
          piecesMap.set(p.id, { code: p.code, name: p.name });
        }
      }

      const ofsReadyList: OfReadyForPlan[] = [];
      for (const of of ofs) {
        const wpsForOf = wps.filter((w) => w.manufacturing_order_id === of.id);
        const unplannedWps = wpsForOf.filter((w) => !plannedWpIds.has(w.id));
        if (unplannedWps.length === 0) continue;
        const piece = of.piece_task_id ? piecesMap.get(of.piece_task_id) : undefined;
        ofsReadyList.push({
          of_id: of.id,
          of_number: of.order_number,
          product_name: of.product_name,
          quantity: of.quantity,
          project_id: of.project_id,
          project_name: of.projects?.name ?? "—",
          project_code: of.projects?.code ?? "—",
          piece_task_id: of.piece_task_id,
          piece_code: piece?.code ?? null,
          piece_name: piece?.name ?? null,
          work_packages: unplannedWps.map((w) => ({
            wp_id: w.id,
            interface_type: w.interface_type,
            label: w.label,
          })),
        });
      }
      setOfsReady(ofsReadyList);

      await loadPlanningForWeek(companyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const loadPlanningForWeek = useCallback(
    async (cid: string) => {
      const from = isoDate(weekStart);
      const to = isoDate(addDays(weekStart, 6));

      const { data, error: planErr } = await supabase
        .from("planning")
        .select(
          "id, of_work_package_id, manufacturing_order_id, piece_task_id, project_id, machine_id, worker_id, planned_date, shift_number, status, " +
            "manufacturing_orders(order_number, product_name), " +
            "pieces_tasks(name), " +
            "workers(full_name), " +
            "of_work_packages(interface_type)",
        )
        .eq("company_id", cid)
        .gte("planned_date", from)
        .lte("planned_date", to)
        .in("status", ["scheduled", "running", "paused"])
        .order("planned_date");

      if (planErr) {
        console.error("[Planning] load error:", planErr);
        return;
      }

      const cards: PlanningCard[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const mo = row.manufacturing_orders as { order_number?: string; product_name?: string } | null;
        const piece = row.pieces_tasks as { name?: string } | null;
        const worker = row.workers as { full_name?: string } | null;
        const wp = row.of_work_packages as { interface_type?: Iface } | null;
        const shiftStr = row.shift_number as string | null;
        return {
          planning_id: row.id as string,
          of_work_package_id: row.of_work_package_id as string,
          manufacturing_order_id: row.manufacturing_order_id as string | null,
          piece_task_id: row.piece_task_id as string | null,
          project_id: row.project_id as string | null,
          machine_id: row.machine_id as string | null,
          worker_id: row.worker_id as string,
          planned_date: row.planned_date as string,
          shift_number: shiftStr ? parseInt(shiftStr, 10) || 1 : 1,
          status: row.status as string,
          of_number: mo?.order_number ?? null,
          product_name: mo?.product_name ?? null,
          piece_name: piece?.name ?? null,
          worker_name: worker?.full_name ?? null,
          wp_interface: wp?.interface_type ?? null,
        };
      });
      setEntries(cards);
    },
    [weekStart],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!companyId) return;
    void loadPlanningForWeek(companyId);
  }, [companyId, weekStart, loadPlanningForWeek]);

  // -----------------------------------------------------------------------
  // Filtres
  // -----------------------------------------------------------------------
  const filteredMachines = useMemo(() => {
    let list = machines;
    if (ifaceFilter !== "all") {
      list = list.filter((m) => machineMatchesIface(m.interface_type, ifaceFilter));
    }
    if (machineFilter) {
      list = list.filter((m) => m.id === machineFilter);
    }
    return list;
  }, [machines, ifaceFilter, machineFilter]);

  const filteredOfs = useMemo(() => {
    if (ifaceFilter === "all") return ofsReady;
    return ofsReady
      .map((o) => ({
        ...o,
        work_packages: o.work_packages.filter((wp) => wp.interface_type === ifaceFilter),
      }))
      .filter((o) => o.work_packages.length > 0);
  }, [ofsReady, ifaceFilter]);

  // -----------------------------------------------------------------------
  // Shifts d'une machine
  // -----------------------------------------------------------------------
  function getMachineShifts(machine: MachineRow): { n: number; start: string; end: string }[] {
    if (!settings) return [];
    const iface: Iface = machine.interface_type === "classique" ? "classique" : "cnc";
    const count = getShiftsPerDay(settings, iface);
    const out: { n: number; start: string; end: string }[] = [];
    for (let i = 1; i <= count; i += 1) {
      out.push({
        n: i,
        start: getShiftStartTime(settings, iface, i),
        end: getShiftEndTime(settings, iface, i),
      });
    }
    return out;
  }

  // -----------------------------------------------------------------------
  // Drag & Drop
  // -----------------------------------------------------------------------
  function onDragStart(e: React.DragEvent, payload: DragPayload) {
    dragDataRef.current = payload;
    setDragging(payload);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function onDragEnd() {
    dragDataRef.current = null;
    setDragging(null);
  }

  function handleDrop(
    e: React.DragEvent,
    machine: MachineRow,
    day: Date,
    shiftNumber: number,
  ) {
    e.preventDefault();
    const payload = dragDataRef.current;
    setDragging(null);
    dragDataRef.current = null;
    if (!payload || !companyId || !settings) return;

    if (!machineMatchesIface(machine.interface_type, payload.wp_interface)) {
      setError(
        t("production.planning.incompatibleMachine", {
          iface: payload.wp_interface.toUpperCase(),
        }),
      );
      setTimeout(() => setError(null), 4000);
      return;
    }

    const dow = day.getDay();
    if (!workingDaysSet.has(dow)) {
      setError(t("production.planning.notWorkingDay"));
      setTimeout(() => setError(null), 4000);
      return;
    }

    const exists = entries.some(
      (c) =>
        c.of_work_package_id === payload.wp_id &&
        c.planned_date === isoDate(day) &&
        c.shift_number === shiftNumber &&
        c.machine_id === machine.id,
    );
    if (exists) {
      setError(t("production.planning.duplicateAssignment"));
      setTimeout(() => setError(null), 3000);
      return;
    }

    const candidateWorkers = workers.filter((w) =>
      machineMatchesIface(w.interface_type, payload.wp_interface),
    );
    if (candidateWorkers.length === 0) {
      setError(t("production.planning.noWorkerForInterface"));
      setTimeout(() => setError(null), 4000);
      return;
    }

    const busyWorkerIds = new Set(
      entries
        .filter(
          (c) =>
            c.machine_id === machine.id &&
            c.planned_date === isoDate(day) &&
            c.shift_number === shiftNumber,
        )
        .map((c) => c.worker_id),
    );

    setPendingDrop({
      payload,
      machine,
      day,
      shiftNumber,
      candidateWorkers,
      busyWorkerIds,
      piece_task_id: payload.piece_task_id,
      project_id: payload.project_id,
    });

    const free = candidateWorkers.find((w) => !busyWorkerIds.has(w.id));
    setSelectedWorkerId(free?.id ?? candidateWorkers[0].id);
  }

  async function confirmDrop() {
    if (!pendingDrop || !selectedWorkerId || !companyId || !settings) return;
    const { payload, machine, day, shiftNumber, piece_task_id, project_id } = pendingDrop;

    setIsSaving(true);
    try {
      const iface: Iface = machine.interface_type === "classique" ? "classique" : "cnc";

      const { error: insErr } = await supabase.from("planning").insert({
        company_id: companyId,
        manufacturing_order_id: payload.of_id,
        of_work_package_id: payload.wp_id,
        piece_task_id: piece_task_id,
        project_id: project_id,   // ✅ AJOUT
        machine_id: machine.id,
        worker_id: selectedWorkerId,
        planned_date: isoDate(day),
        shift_number: String(shiftNumber),
        shift_start: getShiftStartTime(settings, iface, shiftNumber),
        shift_end: getShiftEndTime(settings, iface, shiftNumber),
        status: "scheduled",
        created_by: staffUser?.id,
      } as never);

      if (insErr) throw insErr;

      await updateOfStatusIfAllPlanned(payload.of_id);

      setInfoMessage(t("production.planning.savedSuccess"));
      setTimeout(() => setInfoMessage(null), 2500);
      setPendingDrop(null);
      setSelectedWorkerId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateOfStatusIfAllPlanned(ofId: string) {
    if (!companyId) return;
    const { data: wps } = await supabase
      .from("of_work_packages")
      .select("id")
      .eq("company_id", companyId)
      .eq("manufacturing_order_id", ofId);
    const wpIds = ((wps ?? []) as { id: string }[]).map((x) => x.id);
    if (wpIds.length === 0) return;

    const { data: planned } = await supabase
      .from("planning")
      .select("of_work_package_id")
      .eq("company_id", companyId)
      .in("of_work_package_id", wpIds)
      .in("status", ["scheduled", "running", "paused"]);
    const plannedSet = new Set(
      ((planned ?? []) as { of_work_package_id: string | null }[])
        .map((p) => p.of_work_package_id)
        .filter((x): x is string => !!x),
    );
    if (plannedSet.size < wpIds.length) return;

    const nowIso = new Date().toISOString();
    await supabase
      .from("manufacturing_orders")
      .update({ status: "scheduled", scheduled_at: nowIso } as never)
      .eq("id", ofId)
      .eq("company_id", companyId);

    const { data: of } = await supabase
      .from("manufacturing_orders")
      .select("piece_task_id")
      .eq("id", ofId)
      .eq("company_id", companyId)
      .maybeSingle();
    const pieceId = (of as { piece_task_id: string | null } | null)?.piece_task_id;
    if (pieceId) {
      await supabase
        .from("pieces_tasks")
        .update({ production_status: "scheduled", scheduled_at: nowIso } as never)
        .eq("id", pieceId)
        .eq("company_id", companyId);
    }
  }

  async function handleRemoveCard(card: PlanningCard) {
    if (!companyId) return;
    if (!window.confirm(t("production.planning.confirmCancel"))) return;
    setIsSaving(true);
    try {
      await supabase
        .from("planning")
        .update({ status: "cancelled" } as never)
        .eq("id", card.planning_id)
        .eq("company_id", companyId);

      if (card.manufacturing_order_id) {
        const { data: remaining } = await supabase
          .from("planning")
          .select("id")
          .eq("company_id", companyId)
          .eq("manufacturing_order_id", card.manufacturing_order_id)
          .in("status", ["scheduled", "running", "paused"]);
        if (!remaining || remaining.length === 0) {
          await supabase
            .from("manufacturing_orders")
            .update({ status: "ready", scheduled_at: null } as never)
            .eq("id", card.manufacturing_order_id)
            .eq("company_id", companyId);
          if (card.piece_task_id) {
            await supabase
              .from("pieces_tasks")
              .update({ production_status: "ready_to_start", scheduled_at: null } as never)
              .eq("id", card.piece_task_id)
              .eq("company_id", companyId);
          }
        }
      }

      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  function prevWeek() {
    setWeekStart((d) => addDays(d, -7));
  }
  function nextWeek() {
    setWeekStart((d) => addDays(d, 7));
  }
  function thisWeek() {
    setWeekStart(startOfWeek(new Date()));
  }

  const cardsByCell = useMemo(() => {
    const map = new Map<string, PlanningCard[]>();
    for (const c of entries) {
      if (!c.machine_id) continue;
      const key = `${c.machine_id}__${c.planned_date}__${c.shift_number}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [entries]);

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }

  const dayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600">
            <XCircle size={16} />
          </button>
        </div>
      )}
      {infoMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          <CheckCircle2 size={16} />
          {infoMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50">
            <ChevronLeft size={14} />
          </button>
          <button onClick={thisWeek} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {t("production.planning.thisWeek")}
          </button>
          <button onClick={nextWeek} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50">
            <ChevronRight size={14} />
          </button>
          <span className="ms-2 text-xs font-mono text-slate-500" dir="ltr">
            {isoDate(weekStart)} → {isoDate(addDays(weekStart, 6))}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ifaceFilter}
            onChange={(e) => {
              setIfaceFilter(e.target.value as "all" | Iface);
              setMachineFilter("");
            }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          >
            <option value="all">{t("production.planning.filterAllIfaces")}</option>
            <option value="cnc">CNC</option>
            <option value="classique">Classique</option>
          </select>

          <select
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          >
            <option value="">{t("production.planning.allMachines")}</option>
            {filteredMachines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code ? `${m.code} — ` : ""}
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Layers size={12} />
              {t("production.planning.queue")}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {filteredOfs.reduce((sum, o) => sum + o.work_packages.length, 0)}
            </span>
          </div>

          {filteredOfs.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">
              {t("production.planning.queueEmpty")}
            </p>
          ) : (
            <ul className="max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto pe-1">
              {filteredOfs.map((of) => (
                <li key={of.of_id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <div className="mb-1.5 flex items-start gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-mono text-[10px] font-bold text-slate-500" dir="ltr">
                          {of.of_number}
                        </span>
                        <span className="truncate text-xs font-bold text-slate-800">
                          {of.piece_name || of.product_name}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                        <span className="truncate">{of.project_name}</span>
                        <span>· Qté {of.quantity}</span>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-1">
                    {of.work_packages.map((wp) => {
                      const payload: DragPayload = {
                        of_id: of.of_id,
                        of_number: of.of_number,
                        wp_id: wp.wp_id,
                        wp_interface: wp.interface_type,
                        product_name: of.piece_name || of.product_name,
                        piece_task_id: of.piece_task_id,
                        project_id: of.project_id,   // ✅ AJOUT
                      };
                      const isDragging = dragging?.wp_id === wp.wp_id;
                      return (
                        <li key={wp.wp_id}>
                          <div
                            draggable
                            onDragStart={(e) => onDragStart(e, payload)}
                            onDragEnd={onDragEnd}
                            className={`flex cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-all ${
                              isDragging
                                ? "border-indigo-400 bg-indigo-50 opacity-50"
                                : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50"
                            }`}
                          >
                            <GripVertical size={11} className="shrink-0 text-slate-300" />
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${ifaceBadgeClass(wp.interface_type)}`}>
                              {wp.interface_type === "cnc" ? (
                                <Cpu size={9} className="inline" />
                              ) : (
                                <Wrench size={9} className="inline" />
                              )}{" "}
                              {wp.interface_type.toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                              {wp.label ?? "—"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky start-0 top-0 z-10 border-b border-slate-200 bg-slate-50 px-2 py-2 text-start text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {t("production.planning.machineCol")}
                </th>
                {weekDays.map((d) => {
                  const dow = d.getDay();
                  const worked = workingDaysSet.has(dow);
                  const isToday = isoDate(d) === isoDate(new Date());
                  return (
                    <th
                      key={isoDate(d)}
                      className={`border-b border-s border-slate-200 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide ${
                        worked ? "bg-slate-50 text-slate-600" : "bg-slate-100 text-slate-300"
                      }`}
                    >
                      <div>{dayLabels[dow]}</div>
                      <div className={`font-mono ${isToday ? "text-indigo-600" : "text-slate-400"}`} dir="ltr">
                        {d.getDate()}/{d.getMonth() + 1}
                      </div>
                      {!worked && (
                        <div className="mt-0.5 text-[9px] font-normal normal-case text-slate-400">
                          {t("production.planning.closed")}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredMachines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("production.planning.noMachines")}
                  </td>
                </tr>
              ) : (
                filteredMachines.map((m) => {
                  const shifts = getMachineShifts(m);
                  const isCnc = m.interface_type !== "classique";
                  return (
                    <tr key={m.id} className="align-top">
                      <td className="sticky start-0 z-[1] border-b border-e border-slate-200 bg-white px-2 py-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          {isCnc ? (
                            <Cpu size={12} className="shrink-0 text-amber-600" />
                          ) : (
                            <Wrench size={12} className="shrink-0 text-blue-600" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-700">{m.name}</div>
                            {m.code && (
                              <div className="truncate font-mono text-[10px] text-slate-400" dir="ltr">
                                {m.code}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {weekDays.map((d) => {
                        const worked = workingDaysSet.has(d.getDay());
                        const dateStr = isoDate(d);
                        return (
                          <td
                            key={dateStr}
                            className={`border-b border-s border-slate-200 p-0.5 align-top ${
                              worked ? "" : "bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              {shifts.map((sh) => {
                                const cellKey = `${m.id}__${dateStr}__${sh.n}`;
                                const cards = cardsByCell.get(cellKey) ?? [];
                                const cellDisabled = !worked;
                                return (
                                  <div
                                    key={sh.n}
                                    onDragOver={(e) => {
                                      if (!cellDisabled) e.preventDefault();
                                    }}
                                    onDrop={(e) => !cellDisabled && handleDrop(e, m, d, sh.n)}
                                    className={`min-h-[46px] rounded border p-0.5 transition-colors ${
                                      cellDisabled
                                        ? "border-transparent bg-transparent"
                                        : dragging
                                          ? "border-dashed border-indigo-300 bg-indigo-50/40"
                                          : "border-transparent bg-slate-50/40"
                                    }`}
                                    title={
                                      cellDisabled
                                        ? ""
                                        : `${t("production.planning.shift")} ${sh.n} — ${sh.start} → ${sh.end}`
                                    }
                                  >
                                    <div className="mb-0.5 flex items-center justify-between px-0.5">
                                      <span className="text-[9px] font-bold text-slate-400">
                                        P{sh.n}
                                      </span>
                                      <span className="font-mono text-[8px] text-slate-300" dir="ltr">
                                        {sh.start}–{sh.end}
                                      </span>
                                    </div>

                                    {cards.map((c) => (
                                      <div
                                        key={c.planning_id}
                                        className="group relative mb-0.5 flex items-center gap-1 rounded bg-white px-1 py-1 text-[10px] shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
                                      >
                                        <span className={`shrink-0 rounded-full px-1 py-0.5 text-[8px] font-bold ${ifaceBadgeClass(c.wp_interface ?? "classique")}`}>
                                          {c.wp_interface === "cnc" ? "CNC" : "CLS"}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate font-bold text-slate-700">
                                            {c.piece_name || c.product_name || "—"}
                                          </div>
                                          {c.worker_name && (
                                            <div className="flex items-center gap-0.5 truncate text-[9px] text-slate-400">
                                              <User size={8} />
                                              {c.worker_name}
                                            </div>
                                          )}
                                        </div>
                                        <button
                                          onClick={() => void handleRemoveCard(c)}
                                          className="absolute end-0 top-0 hidden -translate-y-1 translate-x-1 rounded-full bg-red-500 p-0.5 text-white group-hover:block"
                                          title={t("production.planning.cancelEntry")}
                                        >
                                          <XCircle size={10} />
                                        </button>
                                      </div>
                                    ))}

                                    {cards.length === 0 && !cellDisabled && (
                                      <div className="flex h-[28px] items-center justify-center text-[9px] text-slate-300">
                                        <Circle size={6} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isSaving && (
        <div className="fixed bottom-4 end-4 z-50 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white shadow-lg">
          <Loader2 size={12} className="animate-spin" />
          {t("production.planning.saving")}
        </div>
      )}

      {pendingDrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="mb-3 text-base font-bold text-slate-800">
              {t("production.planning.chooseWorker")}
            </h2>

            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-slate-500" dir="ltr">
                  {pendingDrop.payload.of_number}
                </span>
                <span className="font-bold text-slate-700">
                  {pendingDrop.payload.product_name}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${ifaceBadgeClass(pendingDrop.payload.wp_interface)}`}>
                  {pendingDrop.payload.wp_interface.toUpperCase()}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Factory size={10} />
                  {pendingDrop.machine.name}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar size={10} />
                  {isoDate(pendingDrop.day)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={10} />
                  P{pendingDrop.shiftNumber}
                </span>
              </div>
            </div>

            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {t("production.planning.selectWorker")}
            </p>
            <ul className="mb-4 max-h-64 space-y-1.5 overflow-y-auto">
              {pendingDrop.candidateWorkers.map((w) => {
                const isBusy = pendingDrop.busyWorkerIds.has(w.id);
                const isSelected = selectedWorkerId === w.id;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedWorkerId(w.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm transition-colors ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected ? "border-indigo-600" : "border-slate-300"
                        }`}
                      >
                        {isSelected && (
                          <span className="h-2 w-2 rounded-full bg-indigo-600" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                        {w.full_name}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                        {w.interface_type.toUpperCase()}
                      </span>
                      {isBusy && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                          {t("production.planning.workerBusy")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDrop(null);
                  setSelectedWorkerId(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmDrop()}
                disabled={!selectedWorkerId || isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving && <Loader2 size={13} className="animate-spin" />}
                {isSaving ? t("common.saving") : t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}