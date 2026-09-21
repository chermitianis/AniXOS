import { useTranslation } from "react-i18next";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { StopReason } from "../../../shared/types/database";

const PRESET_COLORS = ["#F97316", "#EA580C", "#DC2626", "#B45309", "#9A3412", "#78350F"];

export function StopReasonsAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [stopReasons, setStopReasons] = useState<StopReason[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [requiresNote, setRequiresNote] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStopReasons() {
    const { data } = await supabase.from("stop_reasons").select("*").order("sort_order");
    setStopReasons((data as StopReason[]) ?? []);
  }

  useEffect(() => {
    void loadStopReasons();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);

    try {
      const { error: insertError } = await supabase.from("stop_reasons").insert({
        company_id: staffUser.company_id,
        name,
        color,
        requires_note: requiresNote,
        sort_order: stopReasons.length,
      });

      if (insertError) {
        setError(insertError.message.includes("duplicate") ? t("setup.usernameTaken") : t("setup.genericError"));
        return;
      }

      setName("");
      setRequiresNote(false);
      await loadStopReasons();
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(reason: StopReason) {
    await supabase.from("stop_reasons").update({ is_active: !reason.is_active }).eq("id", reason.id);
    await loadStopReasons();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-1 text-base font-bold text-slate-800 sm:text-lg">{t("setup.addStopReason")}</h2>
        <p className="mb-4 text-xs text-slate-400 sm:text-sm">{t("setup.stopReasonsDesc")}</p>

        <AdminField label={t("setup.stopReasonName")}>
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

        <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={requiresNote} onChange={(e) => setRequiresNote(e.target.checked)} />
          {t("setup.requiresNote")}
        </label>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.addButton")}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.stopReasonsList")} ({stopReasons.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {stopReasons.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-white"
              style={{ backgroundColor: r.color }}
            >
              <span className="min-w-0 flex-1 truncate font-semibold">
                {r.name} {r.requires_note && "📝"}
              </span>
              <button
                onClick={() => toggleActive(r)}
                className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold"
              >
                {r.is_active ? t("common.active") : t("common.inactive")}
              </button>
            </li>
          ))}
          {stopReasons.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>
    </div>
  );
}