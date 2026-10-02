import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Factory, Calendar, User, Clock, CheckCircle2,
  AlertTriangle, Cpu, Wrench, XCircle, ChevronLeft, ChevronRight,
  GripVertical, Layers, Circle, Users,
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
  project_id: string | null;
  machine_id: string | null;
  worker_id: string;
  planned_date: string;
  shift_number: number;
  status: string;
  sequence_order: number;   // ✅ NEW
  of_number: string | null;
  product_name: string | null;
  piece_name: string | null;
  worker_name: string | null;
  wp_interface: Iface | null;
}

/** Payload de drag — queue, cell-move, cell-reorder */
interface DragPayload {
  source: "queue" | "cell";
  of_id: string;
  of_number: string;
  wp_id: string;
  wp_interface: Iface;
  product_name: string;
  piece_task_id: string | null;
  project_id: string | null;
  /** Présent uniquement si source === "cell" */
  planning_id?: string;
  current_machine_id?: string | null;
  current_date?: string;
  current_shift?: number;
  current_sequence_order?: number;
}

interface CellContext {
  machine: MachineRow;
  day: Date;
  shiftNumber: number;
  cards: PlanningCard[];
  cellWorkerId: string | null;
  candidateWorkers: WorkerRow[];
}

interface WorkerPickerState {
  context: CellContext;
  pendingPayload: DragPayload | null;
  isEditMode: boolean;
}

interface CellWorkerRow {
  machine_id: string;
  planned_date: string;
  shift_number: string;
  worker_id: string;
}

/** État de drag-reorder interne à une cellule */
interface ReorderState {
  cellKey: string;
  draggedPlanningId: string;
  targetPlanningId: string | null;
  position: "before" | "after" | null;
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
    ? "bg-amber-100 text-amber-800 ring-amber-200"
    : "bg-blue-100 text-blue-700 ring-blue-200";
}

function parseShiftNumber(raw: string | null): number {
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n)) return n;
  const m = raw.match(/poste_(\d+)/);
  if (m) return parseInt(m[1], 10) || 1;
  return 1;
}

const CELL_KEY = (machineId: string, dateIso: string, shift: number) =>
  `${machineId}__${dateIso}__${shift}`;

/** Texte qui défile au clic */
function MarqueeText({ text, className }: { text: string; className?: string }) {
  const [isClicked, setIsClicked] = useState(false);

  return (
    <div
      className={`overflow-hidden ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setIsClicked((v) => !v);
      }}
      title={text}
    >
      <div
        className={
          isClicked
            ? "animate-marquee inline-block whitespace-nowrap"
            : "truncate"
        }
      >
        {text}
      </div>
    </div>
  );
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
  const [cellWorkers, setCellWorkers] = useState<CellWorkerRow[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [workerPicker, setWorkerPicker] = useState<WorkerPickerState | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  /** ✅ État de réorganisation intra-cellule */
  const [reorder, setReorder] = useState<ReorderState | null>(null);

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
        .in("status", ["scheduled", "in_progress"]);
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
          "id, of_work_package_id, manufacturing_order_id, piece_task_id, project_id, machine_id, worker_id, planned_date, shift_number, status, sequence_order, " +
            "manufacturing_orders(order_number, product_name), " +
            "pieces_tasks(name), " +
            "workers(full_name), " +
            "of_work_packages(interface_type)",
        )
        .eq("company_id", cid)
        .gte("planned_date", from)
        .lte("planned_date", to)
        .in("status", ["scheduled", "in_progress"])
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
          shift_number: parseShiftNumber(shiftStr),
          status: row.status as string,
          sequence_order: (row.sequence_order as number | null) ?? 1,
          of_number: mo?.order_number ?? null,
          product_name: mo?.product_name ?? null,
          piece_name: piece?.name ?? null,
          worker_name: worker?.full_name ?? null,
          wp_interface: wp?.interface_type ?? null,
        };
      });
      setEntries(cards);

      const { data: cwData } = await supabase
        .from("planning_cell_workers")
        .select("machine_id, planned_date, shift_number, worker_id")
        .eq("company_id", cid)
        .gte("planned_date", from)
        .lte("planned_date", to);

      setCellWorkers(
        ((cwData ?? []) as CellWorkerRow[]).map((r) => ({
          ...r,
          shift_number: String(parseShiftNumber(r.shift_number)),
        })),
      );
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
    setReorder(null);
  }

  function getCellWorkerId(machineId: string, dateIso: string, shiftN: number): string | null {
    const stored = cellWorkers.find(
      (c) =>
        c.machine_id === machineId &&
        c.planned_date === dateIso &&
        c.shift_number === String(shiftN),
    );
    if (stored) return stored.worker_id;

    const firstCard = entries.find(
      (e) =>
        e.machine_id === machineId &&
        e.planned_date === dateIso &&
        e.shift_number === shiftN,
    );
    return firstCard?.worker_id ?? null;
  }

  function getCellCards(machineId: string, dateIso: string, shiftN: number): PlanningCard[] {
    return entries.filter(
      (e) =>
        e.machine_id === machineId &&
        e.planned_date === dateIso &&
        e.shift_number === shiftN,
    );
  }

  /** Retourne les cartes triées par sequence_order */
  function getCellCardsSorted(machineId: string, dateIso: string, shiftN: number): PlanningCard[] {
    return getCellCards(machineId, dateIso, shiftN).sort(
      (a, b) => a.sequence_order - b.sequence_order,
    );
  }

  function openWorkerPicker(
    machine: MachineRow,
    day: Date,
    shiftNumber: number,
    pendingPayload: DragPayload | null,
    isEditMode: boolean,
  ) {
    const dateIso = isoDate(day);
    const cards = getCellCards(machine.id, dateIso, shiftNumber);
    const cellWorkerId = getCellWorkerId(machine.id, dateIso, shiftNumber);

    const requiredIface: Iface =
      pendingPayload?.wp_interface ??
      cards[0]?.wp_interface ??
      (machine.interface_type === "classique" ? "classique" : "cnc");

    const candidateWorkers = workers.filter((w) =>
      machineMatchesIface(w.interface_type, requiredIface),
    );

    const context: CellContext = {
      machine,
      day,
      shiftNumber,
      cards,
      cellWorkerId,
      candidateWorkers,
    };

    setWorkerPicker({ context, pendingPayload, isEditMode });
    setSelectedWorkerId(cellWorkerId ?? candidateWorkers[0]?.id ?? null);
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
    setReorder(null);
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

    if (!workingDaysSet.has(day.getDay())) {
      setError(t("production.planning.notWorkingDay"));
      setTimeout(() => setError(null), 4000);
      return;
    }

    const dateIso = isoDate(day);

    if (payload.source === "cell" && payload.planning_id) {
      if (
        payload.current_machine_id === machine.id &&
        payload.current_date === dateIso &&
        payload.current_shift === shiftNumber
      ) {
        return;
      }
      void moveExistingCard(payload, machine, day, shiftNumber);
      return;
    }

    const exists = entries.some(
      (c) =>
        c.of_work_package_id === payload.wp_id &&
        c.planned_date === dateIso &&
        c.shift_number === shiftNumber &&
        c.machine_id === machine.id,
    );
    if (exists) {
      setError(t("production.planning.duplicateAssignment"));
      setTimeout(() => setError(null), 3000);
      return;
    }

    const cellWorkerId = getCellWorkerId(machine.id, dateIso, shiftNumber);

    if (cellWorkerId) {
      void insertNewCard(payload, machine, day, shiftNumber, cellWorkerId);
    } else {
      openWorkerPicker(machine, day, shiftNumber, payload, false);
    }
  }

  /**
   * ✅ Drag interne à une cellule : gère la position de survol (before/after)
   * sur une carte cible.
   */
  function handleCardDragOver(
    e: React.DragEvent,
    cellKey: string,
    targetPlanningId: string,
  ) {
    const payload = dragDataRef.current;
    if (!payload || payload.source !== "cell" || !payload.planning_id) return;
    if (payload.planning_id === targetPlanningId) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position: "before" | "after" = e.clientY < midpoint ? "before" : "after";

    setReorder({
      cellKey,
      draggedPlanningId: payload.planning_id,
      targetPlanningId,
      position,
    });
  }

  /**
   * ✅ Drop interne : réorganise les cartes dans la même cellule
   * et persiste les nouveaux sequence_order.
   */
  async function handleCardDrop(
    e: React.DragEvent,
    machineId: string,
    dateIso: string,
    shiftNumber: number,
    targetPlanningId: string,
  ) {
    e.preventDefault();
    e.stopPropagation();

    const payload = dragDataRef.current;
    setDragging(null);
    setReorder(null);
    dragDataRef.current = null;

    if (!payload || payload.source !== "cell" || !payload.planning_id) return;
    if (payload.planning_id === targetPlanningId) return;

    // Doit être la même cellule
    if (
      payload.current_machine_id !== machineId ||
      payload.current_date !== dateIso ||
      payload.current_shift !== shiftNumber
    ) {
      return;
    }

    const reorderState = reorder;
    if (!reorderState || reorderState.targetPlanningId !== targetPlanningId) {
      return;
    }

    const cards = getCellCardsSorted(machineId, dateIso, shiftNumber);
    const draggedIndex = cards.findIndex((c) => c.planning_id === payload.planning_id);
    const targetIndex = cards.findIndex((c) => c.planning_id === targetPlanningId);
    if (draggedIndex < 0 || targetIndex < 0) return;

    // Construit le nouveau tableau
    const reordered = [...cards];
    const [dragged] = reordered.splice(draggedIndex, 1);
    let newIndex = targetIndex;
    if (reorderState.position === "after") {
      newIndex = targetIndex + (draggedIndex < targetIndex ? 0 : 1);
    } else {
      newIndex = targetIndex + (draggedIndex < targetIndex ? -1 : 0);
    }
    if (newIndex < 0) newIndex = 0;
    if (newIndex > reordered.length) newIndex = reordered.length;
    reordered.splice(newIndex, 0, dragged);

    // Persiste : update chaque carte avec son nouveau sequence_order
    await persistCellOrder(reordered);
  }

  /** ✅ Enregistre les nouveaux ordres pour une cellule */
  async function persistCellOrder(reordered: PlanningCard[]) {
    if (!companyId) return;
    setIsSaving(true);
    try {
      // Mise à jour optimiste locale
      setEntries((prev) => {
        const map = new Map(prev.map((e) => [e.planning_id, e]));
        reordered.forEach((c, idx) => {
          const updated = { ...c, sequence_order: idx + 1 };
          map.set(c.planning_id, updated);
        });
        return Array.from(map.values());
      });

      // Persistance par lots (Promise.all)
      await Promise.all(
        reordered.map((c, idx) =>
          supabase
            .from("planning")
            .update({ sequence_order: idx + 1 } as never)
            .eq("id", c.planning_id)
            .eq("company_id", companyId),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  async function insertNewCard(
    payload: DragPayload,
    machine: MachineRow,
    day: Date,
    shiftNumber: number,
    workerId: string,
  ) {
    if (!companyId || !settings) return;
    setIsSaving(true);
    try {
      const iface: Iface = machine.interface_type === "classique" ? "classique" : "cnc";
      const dateIso = isoDate(day);

      // ✅ Nouveau sequence_order = max(cellules existantes) + 1
      const existingCards = getCellCards(machine.id, dateIso, shiftNumber);
      const maxOrder = existingCards.reduce((m, c) => Math.max(m, c.sequence_order), 0);
      const nextOrder = maxOrder + 1;

      const { error: insErr } = await supabase.from("planning").insert({
        company_id: companyId,
        manufacturing_order_id: payload.of_id,
        of_work_package_id: payload.wp_id,
        piece_task_id: payload.piece_task_id,
        project_id: payload.project_id,
        machine_id: machine.id,
        worker_id: workerId,
        planned_date: dateIso,
        shift_number: String(shiftNumber),
        shift_start: getShiftStartTime(settings, iface, shiftNumber),
        shift_end: getShiftEndTime(settings, iface, shiftNumber),
        status: "scheduled",
        sequence_order: nextOrder,   // ✅
        created_by: staffUser?.id,
      } as never);

      if (insErr) throw insErr;

      await upsertCellWorker(machine.id, dateIso, shiftNumber, workerId);
      await updateOfStatusIfAllPlanned(payload.of_id);

      setInfoMessage(t("production.planning.savedSuccess"));
      setTimeout(() => setInfoMessage(null), 2500);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveExistingCard(
    payload: DragPayload,
    targetMachine: MachineRow,
    targetDay: Date,
    targetShift: number,
  ) {
    if (!companyId || !settings || !payload.planning_id) return;
    setIsSaving(true);
    try {
      const iface: Iface =
        targetMachine.interface_type === "classique" ? "classique" : "cnc";
      const targetDateIso = isoDate(targetDay);

      let targetWorkerId = getCellWorkerId(targetMachine.id, targetDateIso, targetShift);
      if (!targetWorkerId) {
        const sourceCard = entries.find((e) => e.planning_id === payload.planning_id);
        targetWorkerId = sourceCard?.worker_id ?? null;
      }
      if (!targetWorkerId) {
        setError(t("production.planning.noWorkerForInterface"));
        setTimeout(() => setError(null), 4000);
        return;
      }

      // ✅ Nouveau sequence_order = max(cellules cibles) + 1
      const existingCards = getCellCards(targetMachine.id, targetDateIso, targetShift);
      const maxOrder = existingCards.reduce((m, c) => Math.max(m, c.sequence_order), 0);
      const nextOrder = maxOrder + 1;

      const { error: updErr } = await supabase
        .from("planning")
        .update({
          machine_id: targetMachine.id,
          planned_date: targetDateIso,
          shift_number: String(targetShift),
          shift_start: getShiftStartTime(settings, iface, targetShift),
          shift_end: getShiftEndTime(settings, iface, targetShift),
          worker_id: targetWorkerId,
          sequence_order: nextOrder,   // ✅
        } as never)
        .eq("id", payload.planning_id)
        .eq("company_id", companyId);

      if (updErr) throw updErr;

      await upsertCellWorker(targetMachine.id, targetDateIso, targetShift, targetWorkerId);

      setInfoMessage(t("production.planning.savedSuccess"));
      setTimeout(() => setInfoMessage(null), 2500);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  async function upsertCellWorker(
    machineId: string,
    dateIso: string,
    shiftNumber: number,
    workerId: string,
  ) {
    if (!companyId) return;
    const { error: upErr } = await supabase
      .from("planning_cell_workers")
      .upsert(
        {
          company_id: companyId,
          machine_id: machineId,
          planned_date: dateIso,
          shift_number: String(shiftNumber),
          worker_id: workerId,
        } as never,
        { onConflict: "company_id,machine_id,planned_date,shift_number" },
      );
    if (upErr) {
      console.error("[planning_cell_workers] upsert error:", upErr);
    }
  }

  async function confirmWorkerPicker() {
    if (!workerPicker || !selectedWorkerId || !companyId || !settings) return;
    const { context, pendingPayload, isEditMode } = workerPicker;

    setIsSaving(true);
    try {
      const dateIso = isoDate(context.day);

      if (isEditMode) {
        const cards = getCellCards(context.machine.id, dateIso, context.shiftNumber);
        for (const c of cards) {
          if (c.worker_id === selectedWorkerId) continue;
          await supabase
            .from("planning")
            .update({ worker_id: selectedWorkerId } as never)
            .eq("id", c.planning_id)
            .eq("company_id", companyId);
        }
        await upsertCellWorker(context.machine.id, dateIso, context.shiftNumber, selectedWorkerId);
        setInfoMessage(t("production.planning.savedSuccess"));
        setTimeout(() => setInfoMessage(null), 2500);
        setWorkerPicker(null);
        setSelectedWorkerId(null);
        await loadAll();
        return;
      }

      if (pendingPayload) {
        const iface: Iface =
          context.machine.interface_type === "classique" ? "classique" : "cnc";

        // ✅ Nouveau sequence_order = max(cellules existantes) + 1
        const existingCards = getCellCards(context.machine.id, dateIso, context.shiftNumber);
        const maxOrder = existingCards.reduce((m, c) => Math.max(m, c.sequence_order), 0);
        const nextOrder = maxOrder + 1;

        const { error: insErr } = await supabase.from("planning").insert({
          company_id: companyId,
          manufacturing_order_id: pendingPayload.of_id,
          of_work_package_id: pendingPayload.wp_id,
          piece_task_id: pendingPayload.piece_task_id,
          project_id: pendingPayload.project_id,
          machine_id: context.machine.id,
          worker_id: selectedWorkerId,
          planned_date: dateIso,
          shift_number: String(context.shiftNumber),
          shift_start: getShiftStartTime(settings, iface, context.shiftNumber),
          shift_end: getShiftEndTime(settings, iface, context.shiftNumber),
          status: "scheduled",
          sequence_order: nextOrder,   // ✅
          created_by: staffUser?.id,
        } as never);

        if (insErr) throw insErr;

        await upsertCellWorker(
          context.machine.id,
          dateIso,
          context.shiftNumber,
          selectedWorkerId,
        );

        await updateOfStatusIfAllPlanned(pendingPayload.of_id);
      }

      setInfoMessage(t("production.planning.savedSuccess"));
      setTimeout(() => setInfoMessage(null), 2500);
      setWorkerPicker(null);
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
      .in("status", ["scheduled", "in_progress"]);
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
          .in("status", ["scheduled", "in_progress"]);
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
      const key = CELL_KEY(c.machine_id, c.planned_date, c.shift_number);
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    // ✅ Tri par sequence_order
    for (const [key, arr] of map) {
      arr.sort((a, b) => a.sequence_order - b.sequence_order);
      map.set(key, arr);
    }
    return map;
  }, [entries]);

  const cellWorkersMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cw of cellWorkers) {
      map.set(CELL_KEY(cw.machine_id, cw.planned_date, parseInt(cw.shift_number, 10)), cw.worker_id);
    }
    return map;
  }, [cellWorkers]);

  const workersById = useMemo(() => {
    const map = new Map<string, WorkerRow>();
    for (const w of workers) map.set(w.id, w);
    return map;
  }, [workers]);

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

      {/* Toolbar */}
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

      <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
        {/* Queue */}
        <aside className="rounded-xl border border-slate-200 bg-white p-2.5">
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
                        source: "queue",
                        of_id: of.of_id,
                        of_number: of.of_number,
                        wp_id: wp.wp_id,
                        wp_interface: wp.interface_type,
                        product_name: of.piece_name || of.product_name,
                        piece_task_id: of.piece_task_id,
                        project_id: of.project_id,
                      };
                      const isDragging = dragging?.wp_id === wp.wp_id && dragging?.source === "queue";
                      return (
                        <li key={wp.wp_id}>
                          <div
                            draggable
                            onDragStart={(e) => onDragStart(e, payload)}
                            onDragEnd={onDragEnd}
                            className={`flex cursor-grab items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-all ${
                              isDragging
                                ? "border-indigo-400 bg-indigo-50 opacity-50"
                                : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50"
                            }`}
                          >
                            <GripVertical size={13} className="shrink-0 text-slate-300" />
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${ifaceBadgeClass(wp.interface_type)}`}>
                              {wp.interface_type === "cnc" ? (
                                <Cpu size={10} className="inline" />
                              ) : (
                                <Wrench size={10} className="inline" />
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

        {/* Grille */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[120px]" />
              {weekDays.map((d) => (
                <col key={isoDate(d)} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky start-0 top-0 z-10 border-b border-slate-200 bg-slate-50 px-2 py-2.5 text-start text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  {t("production.planning.machineCol")}
                </th>
                {weekDays.map((d) => {
                  const dow = d.getDay();
                  const worked = workingDaysSet.has(dow);
                  const isToday = isoDate(d) === isoDate(new Date());
                  return (
                    <th
                      key={isoDate(d)}
                      className={`border-b border-s border-slate-200 px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide ${
                        worked
                          ? isToday
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-slate-50 text-slate-700"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <div>{dayLabels[dow]}</div>
                      <div
                        className={`font-mono text-xs ${isToday ? "text-indigo-600" : "text-slate-500"}`}
                        dir="ltr"
                      >
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
                            <Cpu size={13} className="shrink-0 text-amber-600" />
                          ) : (
                            <Wrench size={13} className="shrink-0 text-blue-600" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-800" title={m.name}>
                              {m.name}
                            </div>
                            {m.code && (
                              <div className="truncate font-mono text-[9px] text-slate-400" dir="ltr">
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
                            className={`border-b border-s border-slate-200 p-1 align-top ${
                              worked ? "" : "bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-col gap-1">
                              {shifts.map((sh) => {
                                const cellKey = CELL_KEY(m.id, dateStr, sh.n);
                                const cards = cardsByCell.get(cellKey) ?? [];
                                const cellDisabled = !worked;
                                const cellWorkerId = cellWorkersMap.get(cellKey) ?? cards[0]?.worker_id ?? null;
                                const cellWorker = cellWorkerId ? workersById.get(cellWorkerId) : null;
                                const isDraggingOver = dragging != null && !cellDisabled;

                                return (
                                  <div
                                    key={sh.n}
                                    onDragOver={(e) => {
                                      if (!cellDisabled) e.preventDefault();
                                    }}
                                    onDrop={(e) => !cellDisabled && handleDrop(e, m, d, sh.n)}
                                    onClick={(e) => {
                                      if (cellDisabled || isSaving) return;
                                      // Ignore si clic sur une carte (déjà stoppropagé)
                                      openWorkerPicker(m, d, sh.n, null, true);
                                    }}
                                    className={`group/cell min-h-[64px] cursor-pointer rounded-lg border-2 p-1.5 transition-all ${
                                      cellDisabled
                                        ? "cursor-not-allowed border-transparent bg-transparent"
                                        : isDraggingOver
                                          ? "border-dashed border-indigo-400 bg-indigo-50/50"
                                          : "border-slate-100 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/40"
                                    }`}
                                    title={
                                      cellDisabled
                                        ? ""
                                        : `${t("production.planning.shift")} ${sh.n} — ${sh.start} → ${sh.end}`
                                    }
                                  >
                                    <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-700">
                                          P{sh.n}
                                        </span>
                                        {cellWorker && (
                                          <span
                                            className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700"
                                            title={cellWorker.full_name}
                                          >
                                            <User size={9} />
                                            <span className="max-w-[80px] truncate">
                                              {cellWorker.full_name}
                                            </span>
                                          </span>
                                        )}
                                      </div>
                                      <span className="font-mono text-[9px] text-slate-400" dir="ltr">
                                        {sh.start}–{sh.end}
                                      </span>
                                    </div>

                                    {/* Cartes (triées par sequence_order) */}
                                    {cards.map((c, idx) => {
                                      const dragPayload: DragPayload = {
                                        source: "cell",
                                        of_id: c.manufacturing_order_id ?? "",
                                        of_number: c.of_number ?? "",
                                        wp_id: c.of_work_package_id,
                                        wp_interface: c.wp_interface ?? "classique",
                                        product_name: c.piece_name || c.product_name || "",
                                        piece_task_id: c.piece_task_id,
                                        project_id: c.project_id,
                                        planning_id: c.planning_id,
                                        current_machine_id: c.machine_id,
                                        current_date: c.planned_date,
                                        current_shift: c.shift_number,
                                        current_sequence_order: c.sequence_order,
                                      };
                                      const isDraggingThis =
                                        dragging?.planning_id === c.planning_id &&
                                        dragging?.source === "cell";
                                      const reorderState =
                                        reorder &&
                                        reorder.cellKey === cellKey &&
                                        reorder.targetPlanningId === c.planning_id
                                          ? reorder
                                          : null;

                                      return (
                                        <div
                                          key={c.planning_id}
                                          draggable={!cellDisabled}
                                          onDragStart={(e) => {
                                            e.stopPropagation();
                                            onDragStart(e, dragPayload);
                                          }}
                                          onDragEnd={onDragEnd}
                                          onDragOver={(e) =>
                                            handleCardDragOver(e, cellKey, c.planning_id)
                                          }
                                          onDrop={(e) =>
                                            void handleCardDrop(
                                              e,
                                              m.id,
                                              dateStr,
                                              sh.n,
                                              c.planning_id,
                                            )
                                          }
                                          className={`group/card relative mb-1 flex cursor-grab items-start gap-1.5 rounded-md bg-white px-2 py-1.5 text-xs shadow-sm ring-1 ring-slate-200 transition-all hover:ring-indigo-300 ${
                                            isDraggingThis ? "opacity-40" : ""
                                          } ${
                                            reorderState?.position === "before"
                                              ? "border-t-2 border-t-indigo-500"
                                              : reorderState?.position === "after"
                                                ? "border-b-2 border-b-indigo-500"
                                                : ""
                                          }`}
                                        >
                                          <GripVertical
                                            size={11}
                                            className="mt-0.5 shrink-0 text-slate-300"
                                          />
                                          <span className="mt-0.5 shrink-0 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-black text-slate-600">
                                            {idx + 1}
                                          </span>
                                          <span
                                            className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${ifaceBadgeClass(
                                              c.wp_interface ?? "classique",
                                            )}`}
                                          >
                                            {c.wp_interface === "cnc" ? "CNC" : "CLS"}
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <MarqueeText
                                              text={c.piece_name || c.product_name || "—"}
                                              className="font-bold text-slate-800"
                                            />
                                            {c.of_number && (
                                              <div
                                                className="truncate font-mono text-[9px] text-slate-400"
                                                dir="ltr"
                                              >
                                                {c.of_number}
                                              </div>
                                            )}
                                          </div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleRemoveCard(c);
                                            }}
                                            className="invisible shrink-0 rounded-full bg-red-500 p-1 text-white hover:bg-red-600 group-hover/card:visible"
                                            title={t("production.planning.cancelEntry")}
                                          >
                                            <XCircle size={12} />
                                          </button>
                                        </div>
                                      );
                                    })}

                                    {cards.length === 0 && !cellDisabled && (
                                      <div className="flex h-[36px] items-center justify-center text-[10px] text-slate-300 group-hover/cell:text-indigo-400">
                                        {cellWorker ? (
                                          <span className="flex items-center gap-1 text-emerald-600">
                                            <CheckCircle2 size={11} />
                                            {t("production.planning.workerAssigned")}
                                          </span>
                                        ) : (
                                          <Circle size={7} />
                                        )}
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

      {/* Worker picker modal */}
      {workerPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => {
            setWorkerPicker(null);
            setSelectedWorkerId(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
              <Users size={18} className="text-indigo-600" />
              {workerPicker.isEditMode
                ? t("production.planning.changeWorker")
                : t("production.planning.chooseWorker")}
            </h2>

            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                  <Factory size={11} />
                  {workerPicker.context.machine.name}
                </span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Calendar size={11} />
                  {isoDate(workerPicker.context.day)}
                </span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Clock size={11} />
                  P{workerPicker.context.shiftNumber}
                </span>
              </div>
              {workerPicker.pendingPayload && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
                  <span className="font-mono text-[10px] font-bold text-slate-500" dir="ltr">
                    {workerPicker.pendingPayload.of_number}
                  </span>
                  <span className="font-bold text-slate-700">
                    {workerPicker.pendingPayload.product_name}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${ifaceBadgeClass(
                      workerPicker.pendingPayload.wp_interface,
                    )}`}
                  >
                    {workerPicker.pendingPayload.wp_interface.toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {t("production.planning.selectWorker")}
            </p>
            <ul className="mb-4 max-h-64 space-y-1.5 overflow-y-auto">
              {workerPicker.context.candidateWorkers.length === 0 ? (
                <li className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  {t("production.planning.noWorkerForInterface")}
                </li>
              ) : (
                workerPicker.context.candidateWorkers.map((w) => {
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
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWorkerPicker(null);
                  setSelectedWorkerId(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmWorkerPicker()}
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