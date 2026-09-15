import { useTranslation } from "react-i18next";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import bcrypt from "bcryptjs";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { Worker } from "../../../shared/types/database";

function isForeignKeyError(message: string): boolean {
  return message.includes("foreign key") || message.includes("violates");
}

export function WorkersAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hourlyCost, setHourlyCost] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- تعديل عامل موجود ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editSkillLevel, setEditSkillLevel] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // 1. ربط جلب العمال بـ company_id الخاص بـ staffUser
  const loadWorkers = useCallback(async () => {
    if (!staffUser?.company_id) return;

    const { data, error: fetchError } = await supabase
      .from("workers")
      .select("id, company_id, full_name, username, rfid_code, photo_url, hourly_cost, skill_level, is_active, created_at, updated_at")
      .eq("company_id", staffUser.company_id) // تصفية حسب الشركة الحالية
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
      });

      if (insertError) {
        setError(insertError.message.includes("duplicate") ? t("setup.usernameTaken") : t("setup.genericError"));
        return;
      }

      setFullName("");
      setUsername("");
      setPassword("");
      setHourlyCost("");
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
      };
      // كلمة السر تُحدَّث فقط إذا كُتبت قيمة جديدة — تركها فارغة يُبقي القديمة
      if (editPassword) patch.password_hash = bcrypt.hashSync(editPassword, 10);

      const { error: updateError } = await supabase.from("workers").update(patch).eq("id", id);
      if (updateError) {
        setError(updateError.message.includes("duplicate") ? t("setup.usernameTaken") : t("setup.genericError"));
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
      setError(isForeignKeyError(deleteError.message) ? t("setup.cannotDeleteInUse") : t("setup.genericError"));
      return;
    }
    await loadWorkers();
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.addWorker")}</h2>

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

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.addWorker")}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.registeredWorkers")} ({workers.length})</h2>
        <ul className="flex flex-col gap-2">
          {workers.map((w) =>
            editingId === w.id ? (
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
                {error && <div className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">{error}</div>}
                <div className="flex gap-2">
                  <button
                    onClick={() => void saveEdit(w.id)}
                    disabled={isSavingEdit}
                    className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Check size={13} /> {isSavingEdit ? t("setup.saving") : t("setup.saveButton")}
                  </button>
                  <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-lg bg-slate-300 px-3 py-1.5 text-xs font-bold text-white">
                    <X size={13} /> {t("common.cancel")}
                  </button>
                </div>
              </li>
            ) : (
              <li key={w.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold text-slate-700">{w.full_name}</span>
                  <span className="mr-2 text-slate-400">@{w.username}</span>
                  {w.skill_level && <span className="mr-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{w.skill_level}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleActive(w)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      w.is_active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {w.is_active ? t("common.active") : t("common.inactive")}
                  </button>
                  <button onClick={() => startEdit(w)} className="rounded-lg bg-slate-200 p-1.5 text-slate-600 hover:bg-slate-300"><Pencil size={13} /></button>
                  <button onClick={() => deleteWorker(w.id)} className="rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200"><Trash2 size={13} /></button>
                </div>
              </li>
            )
          )}
          {workers.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>
    </div>
  );
}