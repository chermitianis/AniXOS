import { useEffect, useState, useMemo, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Factory } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { PlanningEntry, Worker, Machine, ManufacturingOrder } from "../../../shared/types/database";

interface PlanningRow extends PlanningEntry {
  worker_name?: string;
  machine_name?: string;
  project_name?: string;
  manufacturing_order_id?: string | null;
  shift_number?: string | null;
}

type RecentOrder = ManufacturingOrder & { project_name?: string };

const SHIFT_OPTIONS = [
  { value: "poste_1", labelKey: "setup.poste1" },
  { value: "poste_2", labelKey: "setup.poste2" },
  { value: "poste_3", labelKey: "setup.poste3" },
];

export function PlanningAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();

  const [entries, setEntries] = useState<PlanningRow[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);

  const [manufacturingOrderId, setManufacturingOrderId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [plannedDate, setPlannedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftNumber, setShiftNumber] = useState("poste_1");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReferenceData() {
    const [{ data: w }, { data: m }, { data: mo }] = await Promise.all([
      supabase.from("workers").select("id, company_id, full_name, username, rfid_code, photo_url, hourly_cost, skill_level, is_active, created_at, updated_at").eq("is_active", true),
      supabase.from("machines").select("*").eq("is_active", true).order("name"),
      supabase.from("manufacturing_orders").select("*, projects(name)").order("created_at", { ascending: false }).limit(20),
    ]);
    const machinesList = (m as Machine[]) ?? [];
    setWorkers((w as Worker[]) ?? []);
    setMachines(machinesList);
    setSelectedMachineId((current) => current ?? machinesList[0]?.id ?? null);

    const orders = ((mo ?? []) as Record<string, unknown>[]).map((row) => ({
      ...(row as unknown as ManufacturingOrder),
      project_name: (row.projects as { name?: string } | null)?.name,
    }));
    setRecentOrders(orders);
  }

  async function loadPlanning() {
    const { data } = await supabase
      .from("planning")
      .select("*, workers(full_name), machines(name), projects(name)")
      .order("planned_date", { ascending: false })
      .limit(100);

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as unknown as PlanningEntry),
      worker_name: (row.workers as { full_name?: string } | null)?.full_name,
      machine_name: (row.machines as { name?: string } | null)?.name,
      project_name: (row.projects as { name?: string } | null)?.name,
    }));

    setEntries(rows as PlanningRow[]);
  }

  useEffect(() => {
    void loadReferenceData();
    void loadPlanning();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !workerId || !selectedMachineId || !manufacturingOrderId) return;
    setError(null);
    setIsSaving(true);

    try {
      const order = recentOrders.find((o) => o.id === manufacturingOrderId);
      if (!order) {
        setError(t("setup.chooseOrderFirst"));
        return;
      }

      // اشتقاق القطعة تلقائياً من أمر التصنيع (الربط أُنشئ عند إنشاء الأمر في قسم Ordre de fabrication)
      const { data: linkedPiece } = await supabase
        .from("pieces_tasks")
        .select("id")
        .eq("manufacturing_order_id", order.id)
        .limit(1)
        .maybeSingle();

      const { error: insertError } = await supabase.from("planning").insert({
        company_id: staffUser.company_id,
        worker_id: workerId,
        machine_id: selectedMachineId,
        project_id: order.project_id,
        piece_task_id: (linkedPiece as { id: string } | null)?.id ?? null,
        manufacturing_order_id: order.id,
        planned_date: plannedDate,
        shift_number: shiftNumber,
        status: "scheduled",
        created_by: staffUser.id,
      });

      if (insertError) {
        setError("Erreur lors de la création");
        return;
      }

      setManufacturingOrderId("");
      setWorkerId("");
      await loadPlanning();
    } finally {
      setIsSaving(false);
    }
  }

  const machineEntries = useMemo(
    () => entries.filter((e) => e.machine_id === selectedMachineId).sort((a, b) => b.planned_date.localeCompare(a.planned_date)),
    [entries, selectedMachineId]
  );

  const selectedMachine = machines.find((m) => m.id === selectedMachineId);

  return (
    <div className="flex gap-5">
      {/* تبويبات الآلات — عمودية على اليسار */}
      <aside className="w-52 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {machines.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedMachineId(m.id)}
            className={`block w-full border-b border-slate-100 px-4 py-3 text-start text-sm font-semibold transition-colors last:border-0 ${
              selectedMachineId === m.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m.name}
          </button>
        ))}
        {machines.length === 0 && <p className="p-4 text-sm text-slate-400">{t("setup.noDataYet")}</p>}
      </aside>

      <div className="grid flex-1 gap-6 md:grid-cols-2">
        <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-800">
            <Factory size={17} className="text-indigo-500" />
            {selectedMachine?.name ?? t("setup.newAssignment")}
          </h2>
          <p className="mb-4 text-sm text-slate-400">{t("setup.assignmentDesc")}</p>

          {/* 1. أمر التصنيع — آخر 20 إضافة، الأحدث أولاً */}
          <AdminField label={t("setup.manufacturingOrder")}>
            <select value={manufacturingOrderId} onChange={(e) => setManufacturingOrderId(e.target.value)} className={adminInputClass} required>
              <option value="">{t("setup.chooseOrder")}</option>
              {recentOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} — {o.product_name} ({o.project_name})
                </option>
              ))}
            </select>
          </AdminField>

          {/* 2. العامل */}
          <AdminField label={t("setup.worker")}>
            <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={adminInputClass} required>
              <option value="">{t("setup.selectWorker")}</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name}
                </option>
              ))}
            </select>
          </AdminField>

          {/* 3. التاريخ */}
          <AdminField label={t("setup.date")}>
            <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className={adminInputClass} required />
          </AdminField>

          {/* 4. الوردية */}
          <AdminField label={t("setup.shiftNumber")}>
            <select value={shiftNumber} onChange={(e) => setShiftNumber(e.target.value)} className={adminInputClass} required>
              {SHIFT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </option>
              ))}
            </select>
          </AdminField>

          {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={isSaving || !workerId || !manufacturingOrderId || !selectedMachineId}
            className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSaving ? t("setup.saving") : t("setup.saveAssignment")}
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-slate-800">
            {selectedMachine?.name} — {t("setup.recentAssignments")} ({machineEntries.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {machineEntries.map((entry) => (
              <li key={entry.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{entry.worker_name}</span>
                  <span className="text-xs text-slate-400" dir="ltr">
                    {entry.planned_date}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {entry.project_name && `${t("setup.projectLabel")}: ${entry.project_name}`}
                  {entry.shift_number && ` — ${t(SHIFT_OPTIONS.find((s) => s.value === entry.shift_number)?.labelKey ?? "")}`}
                </div>
              </li>
            ))}
            {machineEntries.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
