import { useTranslation } from "react-i18next";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { TaskType, StopReason } from "../../../shared/types/database";

const TASK_COLORS = ["#2563EB", "#7C3AED", "#0891B2", "#059669", "#DC2626", "#EA580C"];
const STOP_COLORS = ["#F97316", "#EA580C", "#DC2626", "#B45309", "#9A3412", "#78350F"];

/** رسالة ودّية عند رفض الحذف بسبب استخدام العنصر في جلسات سابقة (قيد مرجعي) */
function isForeignKeyError(message: string): boolean {
  return message.includes("foreign key") || message.includes("violates");
}

export function OperationsAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"task_types" | "stop_reasons">("task_types");

  // --- Opérations (task_types) ---
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [ttName, setTtName] = useState("");
  const [ttColor, setTtColor] = useState(TASK_COLORS[0]);
  const [editingTtId, setEditingTtId] = useState<string | null>(null);
  const [editTtName, setEditTtName] = useState("");
  const [editTtColor, setEditTtColor] = useState("");

  // --- Causes d'arrêt (stop_reasons) ---
  const [stopReasons, setStopReasons] = useState<StopReason[]>([]);
  const [srName, setSrName] = useState("");
  const [srColor, setSrColor] = useState(STOP_COLORS[0]);
  const [srRequiresNote, setSrRequiresNote] = useState(false);
  const [editingSrId, setEditingSrId] = useState<string | null>(null);
  const [editSrName, setEditSrName] = useState("");
  const [editSrColor, setEditSrColor] = useState("");
  const [editSrRequiresNote, setEditSrRequiresNote] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTaskTypes() {
    const { data } = await supabase.from("task_types").select("*").order("sort_order");
    setTaskTypes((data as TaskType[]) ?? []);
  }
  async function loadStopReasons() {
    const { data } = await supabase.from("stop_reasons").select("*").order("sort_order");
    setStopReasons((data as StopReason[]) ?? []);
  }

  useEffect(() => {
    void loadTaskTypes();
    void loadStopReasons();
  }, []);

  async function handleAddTaskType(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);
    try {
      const { error: insertError } = await supabase.from("task_types").insert({
        company_id: staffUser.company_id,
        name: ttName,
        color: ttColor,
        sort_order: taskTypes.length,
      });
      if (insertError) {
        setError(insertError.message.includes("duplicate") ? t("setup.usernameTaken") : t("setup.genericError"));
        return;
      }
      setTtName("");
      await loadTaskTypes();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddStopReason(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);
    try {
      const { error: insertError } = await supabase.from("stop_reasons").insert({
        company_id: staffUser.company_id,
        name: srName,
        color: srColor,
        requires_note: srRequiresNote,
        sort_order: stopReasons.length,
      });
      if (insertError) {
        setError(insertError.message.includes("duplicate") ? t("setup.usernameTaken") : t("setup.genericError"));
        return;
      }
      setSrName("");
      setSrRequiresNote(false);
      await loadStopReasons();
    } finally {
      setIsSaving(false);
    }
  }

  function startEditTaskType(tt: TaskType) {
    setEditingTtId(tt.id);
    setEditTtName(tt.name);
    setEditTtColor(tt.color);
  }
  async function saveEditTaskType(id: string) {
    await supabase.from("task_types").update({ name: editTtName, color: editTtColor }).eq("id", id);
    setEditingTtId(null);
    await loadTaskTypes();
  }
  async function deleteTaskType(id: string) {
    if (!window.confirm(t("setup.confirmDelete"))) return;
    const { error: deleteError } = await supabase.from("task_types").delete().eq("id", id);
    if (deleteError) {
      setError(isForeignKeyError(deleteError.message) ? t("setup.cannotDeleteInUse") : t("setup.genericError"));
      return;
    }
    await loadTaskTypes();
  }

  function startEditStopReason(sr: StopReason) {
    setEditingSrId(sr.id);
    setEditSrName(sr.name);
    setEditSrColor(sr.color);
    setEditSrRequiresNote(sr.requires_note);
  }
  async function saveEditStopReason(id: string) {
    await supabase.from("stop_reasons").update({ name: editSrName, color: editSrColor, requires_note: editSrRequiresNote }).eq("id", id);
    setEditingSrId(null);
    await loadStopReasons();
  }
  async function deleteStopReason(id: string) {
    if (!window.confirm(t("setup.confirmDelete"))) return;
    const { error: deleteError } = await supabase.from("stop_reasons").delete().eq("id", id);
    if (deleteError) {
      setError(isForeignKeyError(deleteError.message) ? t("setup.cannotDeleteInUse") : t("setup.genericError"));
      return;
    }
    await loadStopReasons();
  }

  async function toggleActive(table: "task_types" | "stop_reasons", id: string, current: boolean) {
    await supabase.from(table).update({ is_active: !current }).eq("id", id);
    if (table === "task_types") await loadTaskTypes();
    else await loadStopReasons();
  }

  return (
    <div>
      <div className="mb-5 flex gap-2 rounded-xl border border-slate-200 bg-white p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("task_types")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${activeTab === "task_types" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
        >
          {t("setup.taskTypesList")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stop_reasons")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${activeTab === "stop_reasons" ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}
        >
          {t("setup.stopReasonsList")}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {activeTab === "task_types" ? (
        <div className="grid gap-6 md:grid-cols-2">
          <form onSubmit={handleAddTaskType} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-slate-800">{t("setup.addTaskType")}</h2>
            <p className="mb-4 text-sm text-slate-400">{t("setup.taskTypesDesc")}</p>
            <AdminField label={t("setup.taskTypeName")}>
              <input value={ttName} onChange={(e) => setTtName(e.target.value)} className={adminInputClass} required />
            </AdminField>
            <AdminField label={t("setup.cardColor")}>
              <div className="flex gap-2">
                {TASK_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setTtColor(c)} className="h-8 w-8 rounded-full" style={{ backgroundColor: c, outline: ttColor === c ? "3px solid #1e293b" : "none" }} />
                ))}
              </div>
            </AdminField>
            <button type="submit" disabled={isSaving} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {isSaving ? t("setup.saving") : t("setup.addButton")}
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.taskTypesList")} ({taskTypes.length})</h2>
            <ul className="flex flex-col gap-2">
              {taskTypes.map((tt) =>
                editingTtId === tt.id ? (
                  <li key={tt.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <input value={editTtName} onChange={(e) => setEditTtName(e.target.value)} className="min-w-[120px] flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
                    <div className="flex gap-1">
                      {TASK_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setEditTtColor(c)} className="h-6 w-6 rounded-full" style={{ backgroundColor: c, outline: editTtColor === c ? "2px solid #1e293b" : "none" }} />
                      ))}
                    </div>
                    <button onClick={() => saveEditTaskType(tt.id)} className="rounded-lg bg-green-600 p-1.5 text-white"><Check size={14} /></button>
                    <button onClick={() => setEditingTtId(null)} className="rounded-lg bg-slate-300 p-1.5 text-white"><X size={14} /></button>
                  </li>
                ) : (
                  <li key={tt.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white" style={{ backgroundColor: tt.color }}>
                    <span className="font-semibold">{tt.name}</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => toggleActive("task_types", tt.id, tt.is_active)} className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                        {tt.is_active ? t("common.active") : t("common.inactive")}
                      </button>
                      <button onClick={() => startEditTaskType(tt)} className="rounded-lg bg-white/20 p-1.5"><Pencil size={13} /></button>
                      <button onClick={() => deleteTaskType(tt.id)} className="rounded-lg bg-white/20 p-1.5"><Trash2 size={13} /></button>
                    </div>
                  </li>
                )
              )}
              {taskTypes.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <form onSubmit={handleAddStopReason} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-slate-800">{t("setup.addStopReason")}</h2>
            <p className="mb-4 text-sm text-slate-400">{t("setup.stopReasonsDesc")}</p>
            <AdminField label={t("setup.stopReasonName")}>
              <input value={srName} onChange={(e) => setSrName(e.target.value)} className={adminInputClass} required />
            </AdminField>
            <AdminField label={t("setup.cardColor")}>
              <div className="flex gap-2">
                {STOP_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setSrColor(c)} className="h-8 w-8 rounded-full" style={{ backgroundColor: c, outline: srColor === c ? "3px solid #1e293b" : "none" }} />
                ))}
              </div>
            </AdminField>
            <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={srRequiresNote} onChange={(e) => setSrRequiresNote(e.target.checked)} />
              {t("setup.requiresNote")}
            </label>
            <button type="submit" disabled={isSaving} className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {isSaving ? t("setup.saving") : t("setup.addButton")}
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.stopReasonsList")} ({stopReasons.length})</h2>
            <ul className="flex flex-col gap-2">
              {stopReasons.map((r) =>
                editingSrId === r.id ? (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <input value={editSrName} onChange={(e) => setEditSrName(e.target.value)} className="min-w-[120px] flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
                    <div className="flex gap-1">
                      {STOP_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setEditSrColor(c)} className="h-6 w-6 rounded-full" style={{ backgroundColor: c, outline: editSrColor === c ? "2px solid #1e293b" : "none" }} />
                      ))}
                    </div>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" checked={editSrRequiresNote} onChange={(e) => setEditSrRequiresNote(e.target.checked)} />
                      {t("setup.requiresNote")}
                    </label>
                    <button onClick={() => saveEditStopReason(r.id)} className="rounded-lg bg-green-600 p-1.5 text-white"><Check size={14} /></button>
                    <button onClick={() => setEditingSrId(null)} className="rounded-lg bg-slate-300 p-1.5 text-white"><X size={14} /></button>
                  </li>
                ) : (
                  <li key={r.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white" style={{ backgroundColor: r.color }}>
                    <span className="font-semibold">
                      {r.name} {r.requires_note && "📝"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => toggleActive("stop_reasons", r.id, r.is_active)} className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                        {r.is_active ? t("common.active") : t("common.inactive")}
                      </button>
                      <button onClick={() => startEditStopReason(r)} className="rounded-lg bg-white/20 p-1.5"><Pencil size={13} /></button>
                      <button onClick={() => deleteStopReason(r.id)} className="rounded-lg bg-white/20 p-1.5"><Trash2 size={13} /></button>
                    </div>
                  </li>
                )
              )}
              {stopReasons.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
