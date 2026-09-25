import { useTranslation } from "react-i18next";
import { useEffect, useState, type FormEvent } from "react";
import { Trash2, Cpu, Wrench, Layers } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { localDb } from "../../../lib/localDb";
import { connectivityMonitor } from "../../../lib/connectivity";
import { enqueueSync } from "../../../lib/syncQueue";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { Machine, InterfaceType } from "../../../shared/types/database";

const INTERFACE_OPTIONS: { value: InterfaceType; labelKey: string; icon: typeof Cpu; color: string }[] = [
  { value: "cnc",       labelKey: "setup.interfaceCnc",       icon: Cpu,     color: "text-amber-700 bg-amber-100" },
  { value: "classique", labelKey: "setup.interfaceClassique", icon: Wrench,  color: "text-blue-700 bg-blue-100" },
  { value: "both",      labelKey: "setup.interfaceBoth",      icon: Layers,  color: "text-slate-700 bg-slate-100" },
];

function buildEmptyToolRows(companyId: string, machineId: string, count: number, startFrom = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    company_id: companyId,
    machine_id: machineId,
    tool_number: startFrom + index,
    tool_name: "",
    tool_diameter: 0,
    tool_length: 0,
    is_occupied: false,
    updated_at: new Date().toISOString(),
  }));
}

async function persistToolRows(rows: ReturnType<typeof buildEmptyToolRows>) {
  await localDb.machineTools.bulkPut(rows);

  if (connectivityMonitor.getStatus()) {
    const { error } = await supabase.from("machine_tools").insert(rows);
    if (!error) return;
  }
  for (const row of rows) {
    await enqueueSync("machine_tools", "insert", row);
  }
}

export function MachinesAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [machineType, setMachineType] = useState("");
  const [interfaceType, setInterfaceType] = useState<InterfaceType>("classique");
  const [toolCount, setToolCount] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMachines() {
    const companyId = staffUser?.company_id;
    if (connectivityMonitor.getStatus()) {
      const { data, error: fetchError } = await supabase.from("machines").select("*").order("name");
      if (!fetchError && data) {
        setMachines(data as Machine[]);
        await localDb.machines.bulkPut(data as Machine[]);
        return;
      }
    }
    if (companyId) {
      const cached = await localDb.machines.where("company_id").equals(companyId).sortBy("name");
      setMachines(cached);
    }
  }

  useEffect(() => {
    void loadMachines();
  }, [staffUser?.company_id]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setCode("");
    setMachineType("");
    setInterfaceType("classique");
    setToolCount("0");
  }

  function startEditing(machine: Machine) {
    setEditingId(machine.id);
    setName(machine.name);
    setCode(machine.code);
    setMachineType(machine.machine_type ?? "");
    setInterfaceType((machine.interface_type as InterfaceType) ?? "classique");
    setToolCount(String(machine.tool_count ?? 0));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);

    const requestedToolCount = Math.max(0, Number(toolCount) || 0);

    try {
      if (editingId) {
        await saveEdit(staffUser.company_id, editingId, requestedToolCount);
      } else {
        await saveNewMachine(staffUser.company_id, requestedToolCount);
      }
      resetForm();
      await loadMachines();
    } finally {
      setIsSaving(false);
    }
  }

  async function saveNewMachine(companyId: string, requestedToolCount: number) {
    const machineId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newMachine = {
      id: machineId,
      company_id: companyId,
      name,
      code,
      machine_type: machineType || null,
      location: null,
      tool_count: requestedToolCount,
      tools_count: null,
      current_status: "idle",
      is_active: true,
      interface_type: interfaceType,
      created_at: now,
      updated_at: now,
    };

    await localDb.machines.put(newMachine as unknown as Machine);

    let savedOnline = false;
    if (connectivityMonitor.getStatus()) {
      const { error: insertError } = await supabase.from("machines").insert(newMachine as never);
      if (insertError) {
        if (insertError.message.includes("duplicate")) {
          setError(t("setup.codeTaken"));
          await localDb.machines.delete(machineId);
          return;
        }
      } else {
        savedOnline = true;
      }
    }

    if (!savedOnline) {
      await enqueueSync("machines", "insert", newMachine as unknown as Record<string, unknown>);
    }

    if (requestedToolCount > 0) {
      const rows = buildEmptyToolRows(companyId, machineId, requestedToolCount);
      await persistToolRows(rows);
    }
  }

  async function saveEdit(companyId: string, machineId: string, requestedToolCount: number) {
    const existing = machines.find((m) => m.id === machineId);
    const patch = {
      name,
      code,
      machine_type: machineType || null,
      interface_type: interfaceType,
      tool_count: requestedToolCount,
      updated_at: new Date().toISOString(),
    };

    const cached = await localDb.machines.get(machineId);
    if (cached) await localDb.machines.put({ ...cached, ...patch });

    let savedOnline = false;
    if (connectivityMonitor.getStatus()) {
      const { error: updateError } = await supabase
        .from("machines")
        .update(patch as never)
        .eq("id", machineId);
      if (!updateError) savedOnline = true;
      else setError(t("setup.genericError"));
    }

    if (!savedOnline) {
      await enqueueSync("machines", "update", { id: machineId, ...patch });
    }

    const previousCount = existing?.tool_count ?? 0;
    if (requestedToolCount > previousCount) {
      const rows = buildEmptyToolRows(
        companyId,
        machineId,
        requestedToolCount - previousCount,
        previousCount + 1,
      );
      await persistToolRows(rows);
    }
  }

  const statusLabels: Record<Machine["current_status"], string> = {
    running: t("setup.statusRunning"),
    idle: t("setup.statusIdle"),
    maintenance: t("setup.statusMaintenance"),
    stopped: t("setup.statusStopped"),
  };

  async function deleteMachine(id: string) {
    if (!window.confirm(t("setup.confirmDelete"))) return;
    const { error: deleteError } = await supabase.from("machines").delete().eq("id", id);
    if (deleteError) {
      setError(
        deleteError.message.includes("foreign key") || deleteError.message.includes("violates")
          ? t("setup.cannotDeleteInUse")
          : t("setup.genericError"),
      );
      return;
    }
    if (editingId === id) resetForm();
    await loadMachines();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-800 sm:text-lg">
            {editingId ? t("setup.editMachine") : t("setup.addMachine")}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="shrink-0 text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>

        <AdminField label={t("setup.machineName")}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <AdminField label={t("setup.machineCode")}>
          <input value={code} onChange={(e) => setCode(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <AdminField label={t("setup.machineType")}>
          <input value={machineType} onChange={(e) => setMachineType(e.target.value)} className={adminInputClass} />
        </AdminField>

        {/* Interface */}
        <AdminField label={t("setup.machineInterface")}>
          <div className="grid grid-cols-3 gap-2">
            {INTERFACE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = interfaceType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setInterfaceType(opt.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
                    active
                      ? `border-indigo-500 ${opt.color}`
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <Icon size={14} />
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        </AdminField>

        <AdminField label={t("setup.toolCount")}>
          <input
            type="number"
            min="0"
            step="1"
            value={toolCount}
            onChange={(e) => setToolCount(e.target.value)}
            className={adminInputClass}
          />
        </AdminField>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : editingId ? t("common.save") : t("setup.addMachine")}
        </button>
      </form>

      {/* Liste des machines */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-base font-bold text-slate-800 sm:mb-4 sm:text-lg">
          {t("setup.registeredMachines")} ({machines.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {machines.map((m) => {
            const mInterface = (m.interface_type as InterfaceType) ?? "classique";
            const interfaceMeta = INTERFACE_OPTIONS.find((o) => o.value === mInterface) ?? INTERFACE_OPTIONS[1];
            const InterfaceIcon = interfaceMeta.icon;
            return (
              <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(m)}
                    className="min-w-0 flex-1 text-start"
                  >
                    <div className="truncate font-semibold text-slate-700 hover:text-blue-600">
                      {m.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-400" dir="ltr">{m.code}</span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">
                        {statusLabels[m.current_status]}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${interfaceMeta.color}`}>
                        <InterfaceIcon size={9} />
                        {t(interfaceMeta.labelKey)}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => void deleteMachine(m.id)}
                    className="shrink-0 rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            );
          })}
          {machines.length === 0 && (
            <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>
          )}
        </ul>
      </div>
    </div>
  );
}