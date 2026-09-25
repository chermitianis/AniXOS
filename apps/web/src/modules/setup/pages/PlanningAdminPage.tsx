import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Factory, Calendar, User, Clock, Play, CheckCircle2,
  AlertTriangle, Cpu, Wrench, ChevronRight, XCircle, Filter,
  Pencil, Check,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  STAGES, getStageDef, getStageInterface,
  type OperationInterface,
} from "../../nomenclature/lib/costingConstants";
import type { InterfaceType } from "../../../shared/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OfToSchedule {
  id: string;
  order_number: string;
  product_name: string;
  quantity: number;
  status: string;
  piece_task_id: string | null;
  project_id: string;
  project_name: string;
  project_code: string;
  client_name: string | null;
  primary_operation_type: string | null;
  piece_code: string | null;
  piece_name: string | null;
}

interface MachineRow {
  id: string;
  name: string;
  code: string | null;
  interface_type: InterfaceType;
  is_active: boolean;
}

interface WorkerRow {
  id: string;
  full_name: string;
  interface_type: InterfaceType;
  is_active: boolean;
}

interface PlanningRow {
  id: string;
  manufacturing_order_id: string | null;
  piece_task_id: string | null;
  machine_id: string | null;
  worker_id: string;
  planned_date: string;
  shift_number: string | null;
  status: string;
  machine_name: string | null;
  worker_name: string | null;
  order_number: string | null;
  piece_name: string | null;
  piece_primary_op: string | null;
}

type Step = 1 | 2 | 3;

const SHIFT_OPTIONS = [
  { value: "poste_1", labelKey: "setup.poste1" },
  { value: "poste_2", labelKey: "setup.poste2" },
  { value: "poste_3", labelKey: "setup.poste3" },
];

/**
 * Détecte les erreurs de violation cross-tenant remontées par les triggers DB
 * et les traduit en message clair pour l'UI.
 */
function isCrossTenantError(message: string): boolean {
  return (
    message.includes("CROSS_TENANT") ||
    message.includes("PLANNING_CROSS_TENANT") ||
    message.includes("WORK_SESSION_CROSS_TENANT")
  );
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function PlanningAdminPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [ofs, setOfs] = useState<OfToSchedule[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [entries, setEntries] = useState<PlanningRow[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [selectedOf, setSelectedOf] = useState<OfToSchedule | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftNumber, setShiftNumber] = useState("poste_1");
  const [isSaving, setIsSaving] = useState(false);

  const [filterMachineId, setFilterMachineId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editWorkerId, setEditWorkerId] = useState<string>("");
  const [editMachineId, setEditMachineId] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editShift, setEditShift] = useState<string>("poste_1");
  const [isUpdatingEntry, setIsUpdatingEntry] = useState(false);

  // ---------------------------------------------------------------------
  // Chargement — TOUS les appels filtrent explicitement sur company_id.
  // ---------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    if (!staffUser?.company_id) return;
    const companyId = staffUser.company_id;

    setIsLoading(true);
    setError(null);
    try {
      // 1) OFs préparés (à planifier)
      const { data: ofsData, error: ofsErr } = await supabase
        .from("manufacturing_orders")
        .select("*, projects(name, code, clients(name))")
        .eq("company_id", companyId)
        .eq("status", "prepared")
        .order("prepared_at", { ascending: false });

      if (ofsErr) throw ofsErr;

      // 2) Pièces liées
      const pieceIds = ((ofsData ?? []) as { piece_task_id: string | null }[])
        .map((o) => o.piece_task_id)
        .filter((id): id is string => !!id);

      const piecesMap = new Map<string, { code: string | null; name: string; primary_operation_type: string | null }>();
      if (pieceIds.length > 0) {
        const { data: piecesData } = await supabase
          .from("pieces_tasks")
          .select("id, code, name, primary_operation_type")
          .eq("company_id", companyId)
          .in("id", pieceIds);
        for (const p of (piecesData ?? []) as { id: string; code: string | null; name: string; primary_operation_type: string | null }[]) {
          piecesMap.set(p.id, { code: p.code, name: p.name, primary_operation_type: p.primary_operation_type });
        }
      }

      const ofRows: OfToSchedule[] = ((ofsData ?? []) as Record<string, unknown>[]).map((row) => {
        const proj = row.projects as { name?: string; code?: string; clients?: { name?: string } | null } | null;
        const pieceId = row.piece_task_id as string | null;
        const piece = pieceId ? piecesMap.get(pieceId) : undefined;
        return {
          id: row.id as string,
          order_number: row.order_number as string,
          product_name: row.product_name as string,
          quantity: row.quantity as number,
          status: row.status as string,
          piece_task_id: pieceId,
          project_id: row.project_id as string,
          project_name: proj?.name ?? "—",
          project_code: proj?.code ?? "—",
          client_name: proj?.clients?.name ?? null,
          primary_operation_type: piece?.primary_operation_type ?? null,
          piece_code: piece?.code ?? null,
          piece_name: piece?.name ?? null,
        };
      });
      setOfs(ofRows);

      // 3) Machines — FILTRE EXPLICITE company_id
      const { data: machData } = await supabase
        .from("machines")
        .select("id, name, code, interface_type, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      setMachines((machData as MachineRow[]) ?? []);

      // 4) Workers — FILTRE EXPLICITE company_id
      const { data: workersData } = await supabase
        .from("workers")
        .select("id, full_name, interface_type, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("full_name");
      setWorkers((workersData as WorkerRow[]) ?? []);

      // 5) Planning existant
      await loadPlanning(companyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [staffUser?.company_id]);

  const loadPlanning = useCallback(async (companyId: string) => {
    const { data, error: planErr } = await supabase
      .from("planning")
      .select("*, workers(full_name), machines(name), manufacturing_orders(order_number, product_name), pieces_tasks(primary_operation_type)")
      .eq("company_id", companyId)
      .order("planned_date", { ascending: false })
      .limit(200);

    if (planErr) {
      console.error("[Planning] load error:", planErr);
      return;
    }

    const rows: PlanningRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const mo = row.manufacturing_orders as { order_number?: string; product_name?: string } | null;
      const piece = row.pieces_tasks as { primary_operation_type?: string | null } | null;
      return {
        id: row.id as string,
        manufacturing_order_id: row.manufacturing_order_id as string | null,
        piece_task_id: row.piece_task_id as string | null,
        machine_id: row.machine_id as string | null,
        worker_id: row.worker_id as string,
        planned_date: row.planned_date as string,
        shift_number: row.shift_number as string | null,
        status: row.status as string,
        machine_name: (row.machines as { name?: string } | null)?.name ?? null,
        worker_name: (row.workers as { full_name?: string } | null)?.full_name ?? null,
        order_number: mo?.order_number ?? null,
        piece_name: mo?.product_name ?? null,
        piece_primary_op: piece?.primary_operation_type ?? null,
      };
    });
    setEntries(rows);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ---------------------------------------------------------------------
  // Compatibilité machines/workers
  // ---------------------------------------------------------------------
  const requiredInterface: OperationInterface | null = useMemo(() => {
    if (!selectedOf?.primary_operation_type) return null;
    return getStageInterface(selectedOf.primary_operation_type);
  }, [selectedOf]);

  const compatibleMachines = useMemo(() => {
    if (!requiredInterface) return machines;
    return machines.filter(
      (m) => m.interface_type === requiredInterface || m.interface_type === "both",
    );
  }, [machines, requiredInterface]);

  const compatibleWorkers = useMemo(() => {
    if (!requiredInterface) return workers;
    return workers.filter(
      (w) => w.interface_type === requiredInterface || w.interface_type === "both",
    );
  }, [workers, requiredInterface]);

  const currentStep: Step = !selectedOf ? 1 : !selectedMachineId ? 2 : 3;

  // ---------------------------------------------------------------------
  // Actions — Création
  // ---------------------------------------------------------------------
  function handleSelectOf(of: OfToSchedule) {
    void (async () => {
      if (!of.piece_task_id) {
        setError(t("production.planning.noOperationsBlocked"));
        return;
      }
      const { count } = await supabase
        .from("piece_costing_operations")
        .select("id", { count: "exact", head: true })
        .eq("piece_task_id", of.piece_task_id);
      if (!count || count === 0) {
        setError(t("production.planning.noOperationsBlocked"));
        return;
      }
      setSelectedOf(of);
      setSelectedMachineId(null);
      setSelectedWorkerId(null);
      setError(null);
    })();
  }

  async function handleSave() {
    if (!staffUser || !selectedOf || !selectedMachineId || !selectedWorkerId) return;
    setIsSaving(true);
    setError(null);
    try {
      const duplicate = entries.some(
        (e) =>
          e.worker_id === selectedWorkerId &&
          e.machine_id === selectedMachineId &&
          e.planned_date === plannedDate &&
          e.shift_number === shiftNumber &&
          e.status !== "cancelled",
      );
      if (duplicate) {
        setError(t("production.planning.duplicateAssignment"));
        setIsSaving(false);
        return;
      }

      const { error: insertErr } = await supabase.from("planning").insert({
        company_id: staffUser.company_id,
        worker_id: selectedWorkerId,
        machine_id: selectedMachineId,
        project_id: selectedOf.project_id,
        piece_task_id: selectedOf.piece_task_id,
        manufacturing_order_id: selectedOf.id,
        planned_date: plannedDate,
        shift_number: shiftNumber,
        status: "scheduled",
        created_by: staffUser.id,
      } as never);

      if (insertErr) {
        setError(isCrossTenantError(insertErr.message)
          ? "Erreur : référence cross-tenant détectée et bloquée."
          : insertErr.message);
        setIsSaving(false);
        return;
      }

      await supabase
        .from("manufacturing_orders")
        .update({ status: "scheduled", scheduled_at: new Date().toISOString() } as never)
        .eq("id", selectedOf.id)
        .eq("company_id", staffUser.company_id);

      if (selectedOf.piece_task_id) {
        await supabase
          .from("pieces_tasks")
          .update({ production_status: "scheduled", scheduled_at: new Date().toISOString() } as never)
          .eq("id", selectedOf.piece_task_id)
          .eq("company_id", staffUser.company_id);
      }

      setInfoMessage(t("production.planning.savedSuccess"));
      setSelectedOf(null);
      setSelectedMachineId(null);
      setSelectedWorkerId(null);
      await loadAll();

      setTimeout(() => setInfoMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelPlanning(entry: PlanningRow) {
    if (!staffUser?.company_id) return;
    if (!window.confirm(t("production.planning.confirmCancel"))) return;

    await supabase
      .from("planning")
      .update({ status: "cancelled" } as never)
      .eq("id", entry.id)
      .eq("company_id", staffUser.company_id);

    if (entry.manufacturing_order_id) {
      const { data: stillActive } = await supabase
        .from("planning")
        .select("id")
        .eq("manufacturing_order_id", entry.manufacturing_order_id)
        .eq("company_id", staffUser.company_id)
        .not("status", "in", "(cancelled,done)")
        .limit(1);

      if (!stillActive || stillActive.length === 0) {
        await supabase
          .from("manufacturing_orders")
          .update({ status: "prepared", scheduled_at: null } as never)
          .eq("id", entry.manufacturing_order_id)
          .eq("company_id", staffUser.company_id);

        if (entry.piece_task_id) {
          await supabase
            .from("pieces_tasks")
            .update({ production_status: "ready_to_start", scheduled_at: null } as never)
            .eq("id", entry.piece_task_id)
            .eq("company_id", staffUser.company_id);
        }
      }
    }

    await loadPlanning(staffUser.company_id);
  }

  // ---------------------------------------------------------------------
  // Actions — Édition inline
  // ---------------------------------------------------------------------
  function startEditEntry(entry: PlanningRow) {
    setEditingEntryId(entry.id);
    setEditWorkerId(entry.worker_id);
    setEditMachineId(entry.machine_id ?? "");
    setEditDate(entry.planned_date);
    setEditShift(entry.shift_number ?? "poste_1");
    setError(null);
  }

  function cancelEditEntry() {
    setEditingEntryId(null);
    setError(null);
  }

  async function saveEditEntry(entryId: string) {
    if (!staffUser?.company_id) return;
    setIsUpdatingEntry(true);
    setError(null);
    try {
      const duplicate = entries.some(
        (e) =>
          e.id !== entryId &&
          e.worker_id === editWorkerId &&
          e.machine_id === editMachineId &&
          e.planned_date === editDate &&
          e.shift_number === editShift &&
          e.status !== "cancelled",
      );
      if (duplicate) {
        setError(t("production.planning.duplicateAssignment"));
        setIsUpdatingEntry(false);
        return;
      }

      const { error: updateErr } = await supabase
        .from("planning")
        .update({
          worker_id: editWorkerId,
          machine_id: editMachineId || null,
          planned_date: editDate,
          shift_number: editShift,
        } as never)
        .eq("id", entryId)
        .eq("company_id", staffUser.company_id);

      if (updateErr) {
        setError(isCrossTenantError(updateErr.message)
          ? "Erreur : référence cross-tenant détectée et bloquée."
          : updateErr.message);
        setIsUpdatingEntry(false);
        return;
      }

      setInfoMessage(t("production.planning.savedSuccess"));
      setEditingEntryId(null);
      await loadPlanning(staffUser.company_id);
      setTimeout(() => setInfoMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsUpdatingEntry(false);
    }
  }

  const workersForEdit = useMemo(() => {
    if (!editingEntryId) return [];
    const entry = entries.find((e) => e.id === editingEntryId);
    if (!entry) return workers;
    if (!entry.piece_primary_op) return workers;
    const iface = getStageInterface(entry.piece_primary_op);
    return workers.filter((w) => w.interface_type === iface || w.interface_type === "both");
  }, [editingEntryId, entries, workers]);

  const machinesForEdit = useMemo(() => {
    if (!editingEntryId) return [];
    const entry = entries.find((e) => e.id === editingEntryId);
    if (!entry) return machines;
    if (!entry.piece_primary_op) return machines;
    const iface = getStageInterface(entry.piece_primary_op);
    return machines.filter((m) => m.interface_type === iface || m.interface_type === "both");
  }, [editingEntryId, entries, machines]);

  // ---------------------------------------------------------------------
  // Filtres vue
  // ---------------------------------------------------------------------
  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => e.status !== "cancelled" && e.status !== "done")
      .filter((e) => (filterMachineId ? e.machine_id === filterMachineId : true))
      .filter((e) => (filterDate ? e.planned_date === filterDate : true));
  }, [entries, filterMachineId, filterDate]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Colonne gauche */}
        <div className="space-y-3">
          <StepCard step={1} title={t("production.planning.step1Title")} active={currentStep === 1} done={!!selectedOf}>
            {!selectedOf ? (
              ofs.length === 0 ? (
                <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
                  {t("production.planning.noOfToSchedule")}
                </div>
              ) : (
                <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                  {ofs.map((of) => {
                    const iface = of.primary_operation_type
                      ? getStageInterface(of.primary_operation_type)
                      : null;
                    return (
                      <li key={of.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectOf(of)}
                          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-start text-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-500" dir="ltr">
                                OF-{of.order_number}
                              </span>
                              <span className="truncate font-semibold text-slate-800">
                                {of.piece_name || of.product_name || "—"}
                              </span>
                              {of.piece_code && (
                                <span className="font-mono text-[10px] text-slate-400" dir="ltr">
                                  {of.piece_code}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                              <span>{of.project_name}</span>
                              {of.client_name && <span>· {of.client_name}</span>}
                              {iface && (
                                <span
                                  className={`rounded-full px-1.5 py-0.5 font-bold ${
                                    iface === "cnc"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {iface.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={14} className="shrink-0 text-slate-300" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs">
                <Factory size={14} className="shrink-0 text-indigo-600" />
                <span className="min-w-0 flex-1 truncate font-semibold text-indigo-700">
                  OF-{selectedOf.order_number} — {selectedOf.piece_name || selectedOf.product_name}
                </span>
                <button
                  onClick={() => {
                    setSelectedOf(null);
                    setSelectedMachineId(null);
                    setSelectedWorkerId(null);
                  }}
                  className="shrink-0 text-indigo-500 hover:text-indigo-700"
                >
                  <XCircle size={14} />
                </button>
              </div>
            )}
          </StepCard>

          {selectedOf && (
            <StepCard step={2} title={t("production.planning.step2Title")} active={currentStep === 2} done={!!selectedMachineId}>
              {!selectedMachineId ? (
                compatibleMachines.length === 0 ? (
                  <div className="rounded-lg bg-amber-50 px-3 py-4 text-center text-xs text-amber-700">
                    {t("production.planning.noMachineForInterface")}
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {compatibleMachines.map((m) => {
                      const Icon = m.interface_type === "cnc" ? Cpu : m.interface_type === "classique" ? Wrench : Filter;
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedMachineId(m.id)}
                            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-start text-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                          >
                            <Icon
                              size={14}
                              className={m.interface_type === "cnc" ? "text-amber-600" : "text-blue-600"}
                            />
                            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                              {m.code ? `${m.code} — ` : ""}
                              {m.name}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                m.interface_type === "cnc"
                                  ? "bg-amber-100 text-amber-800"
                                  : m.interface_type === "classique"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {m.interface_type.toUpperCase()}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs">
                  <Cpu size={14} className="shrink-0 text-indigo-600" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-indigo-700">
                    {compatibleMachines.find((m) => m.id === selectedMachineId)?.name}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedMachineId(null);
                      setSelectedWorkerId(null);
                    }}
                    className="shrink-0 text-indigo-500 hover:text-indigo-700"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              )}
            </StepCard>
          )}

          {selectedOf && selectedMachineId && (
            <StepCard step={3} title={t("production.planning.step3Title")} active={currentStep === 3} done={false}>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {t("setup.worker")}
                  </label>
                  {compatibleWorkers.length === 0 ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {t("production.planning.noWorkerForInterface")}
                    </div>
                  ) : (
                    <select
                      value={selectedWorkerId ?? ""}
                      onChange={(e) => setSelectedWorkerId(e.target.value || null)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">{t("setup.selectWorker")}</option>
                      {compatibleWorkers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.full_name}
                          {w.interface_type !== "both" ? ` (${w.interface_type.toUpperCase()})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {t("setup.date")}
                  </label>
                  <input
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {t("setup.shiftNumber")}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SHIFT_OPTIONS.map((s) => {
                      const active = shiftNumber === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setShiftNumber(s.value)}
                          className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {t(s.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => void handleSave()}
                  disabled={isSaving || !selectedWorkerId}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
                  {t("production.planning.confirmSchedule")}
                </button>
              </div>
            </StepCard>
          )}
        </div>

        {/* Colonne droite */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-700">
              {t("production.planning.existingPlanning")} ({filteredEntries.length})
            </h2>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
            <select
              value={filterMachineId ?? ""}
              onChange={(e) => setFilterMachineId(e.target.value || null)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            >
              <option value="">{t("production.planning.allMachines")}</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {filteredEntries.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">
              {t("production.planning.noPlanningEntries")}
            </p>
          ) : (
            <ul className="max-h-[70vh] space-y-1.5 overflow-y-auto">
              {filteredEntries.map((e) => {
                const isEditing = editingEntryId === e.id;
                return (
                  <li key={e.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="shrink-0 text-indigo-500" />
                          <span className="font-mono font-bold text-slate-500" dir="ltr">
                            {editDate}
                          </span>
                          {e.order_number && (
                            <span className="font-mono text-[10px] text-slate-400" dir="ltr">
                              OF-{e.order_number}
                            </span>
                          )}
                        </div>

                        <select
                          value={editWorkerId}
                          onChange={(ev) => setEditWorkerId(ev.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          {workersForEdit.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.full_name}
                              {w.interface_type !== "both" ? ` (${w.interface_type.toUpperCase()})` : ""}
                            </option>
                          ))}
                        </select>

                        <select
                          value={editMachineId}
                          onChange={(ev) => setEditMachineId(ev.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="">— {t("kiosk.noMachine")} —</option>
                          {machinesForEdit.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.code ? `${m.code} — ` : ""}{m.name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="date"
                          value={editDate}
                          onChange={(ev) => setEditDate(ev.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        />

                        <div className="grid grid-cols-3 gap-1">
                          {SHIFT_OPTIONS.map((s) => (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => setEditShift(s.value)}
                              className={`rounded border px-1 py-1 text-[10px] font-semibold ${
                                editShift === s.value
                                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                  : "border-slate-200 text-slate-500"
                              }`}
                            >
                              {t(s.labelKey)}
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => void saveEditEntry(e.id)}
                            disabled={isUpdatingEntry}
                            className="flex flex-1 items-center justify-center gap-1 rounded bg-green-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            {isUpdatingEntry ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Check size={11} />
                            )}
                            {t("common.save")}
                          </button>
                          <button
                            onClick={cancelEditEntry}
                            disabled={isUpdatingEntry}
                            className="flex flex-1 items-center justify-center gap-1 rounded bg-slate-300 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            <XCircle size={11} />
                            {t("common.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <Calendar size={12} className="mt-0.5 shrink-0 text-indigo-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-500" dir="ltr">
                              {e.planned_date}
                            </span>
                            {e.shift_number && (
                              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700">
                                {t(SHIFT_OPTIONS.find((s) => s.value === e.shift_number)?.labelKey ?? "")}
                              </span>
                            )}
                            {e.order_number && (
                              <span className="font-mono text-[10px] text-slate-400" dir="ltr">
                                OF-{e.order_number}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                            {e.worker_name && (
                              <span className="inline-flex items-center gap-1">
                                <User size={9} />
                                {e.worker_name}
                              </span>
                            )}
                            {e.machine_name && (
                              <span className="inline-flex items-center gap-1">
                                <Factory size={9} />
                                {e.machine_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => startEditEntry(e)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-indigo-600"
                            title={t("common.edit")}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => void handleCancelPlanning(e)}
                            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                            title={t("production.planning.cancelEntry")}
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepCard
// ---------------------------------------------------------------------------

function StepCard({
  step,
  title,
  active,
  done,
  children,
}: {
  step: number;
  title: string;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border-2 bg-white p-4 transition-colors ${
        active ? "border-indigo-300 shadow-sm" : done ? "border-green-200" : "border-slate-200"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            done
              ? "bg-green-100 text-green-700"
              : active
                ? "bg-indigo-100 text-indigo-700"
                : "bg-slate-100 text-slate-400"
          }`}
        >
          {done ? <CheckCircle2 size={12} /> : step}
        </span>
        <h3
          className={`text-sm font-bold ${
            active ? "text-slate-800" : done ? "text-green-700" : "text-slate-400"
          }`}
        >
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}