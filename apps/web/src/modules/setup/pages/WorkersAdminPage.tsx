import { useTranslation } from "react-i18next";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import bcrypt from "bcryptjs";
import { Pencil, Trash2, Check, X, Cpu, Wrench, Layers } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { Worker } from "../../../shared/types/database";

type InterfaceType = "cnc" | "manual" | "both";

function isForeignKeyError(message: string): boolean {
  return message.includes("foreign key") || message.includes("violates");
}

const INTERFACE_OPTIONS: { value: InterfaceType; labelKey: string; icon: typeof Cpu; color: string }[] = [
  { value: "cnc",    labelKey: "setup.interfaceCnc",    icon: Cpu,     color: "text-amber-700 bg-amber-100" },
  { value: "manual", labelKey: "setup.interfaceManual", icon: Wrench,  color: "text-blue-700 bg-blue-100" },
  { value: "both",   labelKey: "setup.interfaceBoth",   icon: Layers,  color: "text-slate-700 bg-slate-100" },
];

export function WorkersAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hourlyCost, setHourlyCost] = useState("");
  const [interfaceType, setInterfaceType] = useState<InterfaceType>("both");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editSkillLevel, setEditSkillLevel] = useState("");
  const [editInterfaceType, setEditInterfaceType] = useState<InterfaceType>("both");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadWorkers = useCallback(async () => {
    if (!staffUser?.company_id) return;

    const { data, error: fetchError } = await supabase
      .from("workers")
      .select("*")
      .eq("company_id", staffUser.company_id)
      .order("full_name");

    if (!fetchError && data) {
      setWorkers(data as Worker[]);
    }
  }, [staffUser?.company_id]);

  useEffect(() => {
    void loadWorkers();
  }, [loadWorkers]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser?.company_id) return;
    setError(null);
    setIsSaving(true);

    try {
      const passwordHash = bcrypt.hashSync(password, 10);

      const { error: insertError } = await supabase.from("workers").insert({
        company_id: staffUser.company_id,
        full_name: fullName.trim(),
        username: username.trim(),
        password_hash: passwordHash,
        hourly_cost: Number(hourlyCost) || 0,
        interface_type: interfaceType,
      } as never);

      if (insertError) {
        setError(
          insertError.message.includes("duplicate")
            ? t("setup.usernameTaken")
            : t("setup.genericError"),
        );
        return;
      }

      setFullName("");
      setUsername("");
      setPassword("");
      setHourlyCost("");
      setInterfaceType("both");
      await loadWorkers();
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(worker: Worker) {
    await supabase.from("workers").update({ is_active: !worker.is_active }).eq("id", worker.id);
    await loadWorkers();
  }

  function startEdit(w: Worker) {
    setEditingId(w.id);
    setEditFullName(w.full_name);
    setEditUsername(w.username);
    setEditPassword("");
    setEditSkillLevel(w.skill_level ?? "");
    setEditInterfaceType(
      ((w as unknown as { interface_type?: InterfaceType }).interface_type) ?? "both",
    );
    setError(null);
  }

  async function saveEdit(id: string) {
    setIsSavingEdit(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        full_name: editFullName.trim(),
        username: editUsername.trim(),
        skill_level: editSkillLevel.trim() || null,
        interface_type: editInterfaceType,
      };
      if (editPassword) patch.password_hash = bcrypt.hashSync(editPassword, 10);

      const { error: updateError } = await supabase.from("workers").update(patch).eq("id", id);
      if (updateError) {
        setError(
          updateError.message.includes("duplicate")
            ? t("setup.usernameTaken")
            : t("setup.genericError"),
        );
        return;
      }
      setEditingId(null);
      await loadWorkers();
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function deleteWorker(id: string) {
    if (!window.confirm(t("setup.confirmDelete"))) return;
    const { error: deleteError } = await supabase.from("workers").delete().eq("id", id);
    if (deleteError) {
      setError(
        isForeignKeyError(deleteError.message)
          ? t("setup.cannotDeleteInUse")
          : t("setup.genericError"),
      );
      return;
    }
    await loadWorkers();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.addWorker")}
        </h2>

        <AdminField label={t("setup.workerFullName")}>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <AdminField label={t("setup.workerUsername")}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <AdminField label={t("setup.workerPassword")}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={4}
            className={adminInputClass}
            required
          />
        </AdminField>

        <AdminField label={t("setup.workerHourlyCost")}>
          <input
            type="number"
            step="0.01"
            value={hourlyCost}
            onChange={(e) => setHourlyCost(e.target.value)}
            className={adminInputClass}
          />
        </AdminField>

        {/* Interface Kiosk */}
        <AdminField label={t("setup.workerInterface")}>
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

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.addWorker")}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.registeredWorkers")} ({workers.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {workers.map((w) => {
            const wInterface = ((w as unknown as { interface_type?: InterfaceType }).interface_type) ?? "both";
            const interfaceMeta = INTERFACE_OPTIONS.find((o) => o.value === wInterface) ?? INTERFACE_OPTIONS[2];
            const InterfaceIcon = interfaceMeta.icon;

            return editingId === w.id ? (
              <li key={w.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 grid gap-2 sm:grid-cols-2">
                  <input
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    placeholder={t("setup.workerFullName")}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder={t("setup.workerUsername")}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    dir="ltr"
                  />
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder={t("setup.leaveBlankKeepPassword")}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editSkillLevel}
                    onChange={(e) => setEditSkillLevel(e.target.value)}
                    placeholder={t("setup.workerRole")}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>

                <div className="mb-2 grid grid-cols-3 gap-2">
                  {INTERFACE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = editInterfaceType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditInterfaceType(opt.value)}
                        className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                          active
                            ? `border-indigo-500 ${opt.color}`
                            : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        <Icon size={12} />
                        {t(opt.labelKey)}
                      </button>
                    );
                  })}
                </div>

                {error && <div className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">{error}</div>}
                <div className="flex gap-2">
                  <button
                    onClick={() => void saveEdit(w.id)}
                    disabled={isSavingEdit}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Check size={13} /> {isSavingEdit ? t("setup.saving") : t("setup.saveButton")}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-300 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    <X size={13} /> {t("common.cancel")}
                  </button>
                </div>
              </li>
            ) : (
              <li key={w.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-700">{w.full_name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs text-slate-400" dir="ltr">
                        @{w.username}
                      </span>
                      {w.skill_level && (
                        <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700">
                          {w.skill_level}
                        </span>
                      )}
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${interfaceMeta.color}`}
                      >
                        <InterfaceIcon size={9} />
                        {t(interfaceMeta.labelKey)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => toggleActive(w)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        w.is_active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {w.is_active ? t("common.active") : t("common.inactive")}
                    </button>
                    <button
                      onClick={() => startEdit(w)}
                      className="rounded-lg bg-slate-200 p-1.5 text-slate-600 hover:bg-slate-300"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => deleteWorker(w.id)}
                      className="rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          {workers.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>
    </div>
  );
}