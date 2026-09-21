import { useTranslation } from "react-i18next";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { TaskType } from "../../../shared/types/database";

const PRESET_COLORS = ["#2563EB", "#7C3AED", "#0891B2", "#059669", "#DC2626", "#EA580C"];

export function TaskTypesAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTaskTypes() {
    const { data } = await supabase.from("task_types").select("*").order("sort_order");
    setTaskTypes((data as TaskType[]) ?? []);
  }

  useEffect(() => {
    void loadTaskTypes();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);

    try {
      const { error: insertError } = await supabase.from("task_types").insert({
        company_id: staffUser.company_id,
        name,
        color,
        sort_order: taskTypes.length,
      });

      if (insertError) {
        setError(insertError.message.includes("duplicate") ? t("setup.usernameTaken") : t("setup.genericError"));
        return;
      }

      setName("");
      await loadTaskTypes();
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(taskType: TaskType) {
    await supabase.from("task_types").update({ is_active: !taskType.is_active }).eq("id", taskType.id);
    await loadTaskTypes();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-1 text-base font-bold text-slate-800 sm:text-lg">{t("setup.addTaskType")}</h2>
        <p className="mb-4 text-xs text-slate-400 sm:text-sm">{t("setup.taskTypesDesc")}</p>

        <AdminField label={t("setup.taskTypeName")}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <AdminField label={t("setup.cardColor")}>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-8 w-8 rounded-full"
                style={{ backgroundColor: c, outline: color === c ? "3px solid #1e293b" : "none" }}
              />
            ))}
          </div>
        </AdminField>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.addButton")}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.taskTypesList")} ({taskTypes.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {taskTypes.map((taskType) => (
            <li
              key={taskType.id}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-white"
              style={{ backgroundColor: taskType.color }}
            >
              <span className="min-w-0 flex-1 truncate font-semibold">{taskType.name}</span>
              <button
                onClick={() => toggleActive(taskType)}
                className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold"
              >
                {taskType.is_active ? t("common.active") : t("common.inactive")}
              </button>
            </li>
          ))}
          {taskTypes.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>
    </div>
  );
}