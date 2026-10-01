import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Save, Clock, Cpu, Wrench, Calendar, FolderOpen, RotateCcw,
} from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  getWorkSettings,
  saveWorkSettings,
  DEFAULT_WORK_SETTINGS,
  type WorkSettings,
} from "../../../shared/api/companyWorkSettingsApi";

const DAYS: { n: number; labelKey: string }[] = [
  { n: 1, labelKey: "planning.workSettings.monday" },
  { n: 2, labelKey: "planning.workSettings.tuesday" },
  { n: 3, labelKey: "planning.workSettings.wednesday" },
  { n: 4, labelKey: "planning.workSettings.thursday" },
  { n: 5, labelKey: "planning.workSettings.friday" },
  { n: 6, labelKey: "planning.workSettings.saturday" },
  { n: 0, labelKey: "planning.workSettings.sunday" },
];

export function CompanyWorkSettingsPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [settings, setSettings] = useState<WorkSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // -------------------------------------------------------------------------
  // Chargement
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const s = await getWorkSettings(companyId);
      setSettings(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // -------------------------------------------------------------------------
  // Mise à jour locale
  // -------------------------------------------------------------------------
  function patch<K extends keyof WorkSettings>(key: K, value: WorkSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleDay(n: number) {
    if (!settings) return;
    const set = new Set(settings.working_days);
    if (set.has(n)) set.delete(n);
    else set.add(n);
    patch("working_days", Array.from(set).sort((a, b) => a - b));
  }

  // -------------------------------------------------------------------------
  // Sauvegarde
  // -------------------------------------------------------------------------
  async function handleSave() {
    if (!companyId || !settings) return;
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await saveWorkSettings(companyId, {
        cnc_shifts_per_day: settings.cnc_shifts_per_day,
        cnc_shift_hours: settings.cnc_shift_hours,
        cnc_shift_start_time: settings.cnc_shift_start_time,
        classique_shifts_per_day: settings.classique_shifts_per_day,
        classique_shift_hours: settings.classique_shift_hours,
        classique_shift_start_time: settings.classique_shift_start_time,
        working_days: settings.working_days,
        piece_drawing_base_path: settings.piece_drawing_base_path,
        piece_drawing_path_pattern: settings.piece_drawing_path_pattern,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Reset aux valeurs par défaut
  // -------------------------------------------------------------------------
  function handleReset() {
    if (!window.confirm(t("planning.workSettings.confirmReset"))) return;
    if (!settings) return;
    setSettings({
      ...settings,
      ...DEFAULT_WORK_SETTINGS,
    });
  }

  // -------------------------------------------------------------------------
  // Aperçu du chemin
  // -------------------------------------------------------------------------
  function pathPreview(): string {
    if (!settings) return "—";
    const base = settings.piece_drawing_base_path ?? "";
    const pattern = settings.piece_drawing_path_pattern ?? "{projectCode}/{pieceName}.pdf";
    const example = pattern
      .replace("{projectCode}", "26090201")
      .replace("{pieceName}", "tasseau");
    return base ? `${base}${example}` : example;
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-extrabold text-slate-800">
          {t("planning.workSettings.title")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {t("planning.workSettings.subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {t("planning.workSettings.saved")}
        </div>
      )}

      {/* POSTES CNC */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Cpu size={18} />
          </div>
          <h2 className="text-base font-bold text-slate-800">
            {t("planning.workSettings.cncSection")}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label={t("planning.workSettings.shiftsPerDay")}
            type="number"
            min={1}
            max={6}
            value={settings.cnc_shifts_per_day}
            onChange={(v) => patch("cnc_shifts_per_day", Number(v) || 1)}
          />
          <Field
            label={t("planning.workSettings.shiftHours")}
            type="number"
            min={1}
            max={24}
            value={settings.cnc_shift_hours}
            onChange={(v) => patch("cnc_shift_hours", Number(v) || 8)}
          />
          <Field
            label={t("planning.workSettings.shiftStartTime")}
            type="time"
            value={settings.cnc_shift_start_time}
            onChange={(v) => patch("cnc_shift_start_time", v)}
          />
        </div>
      </div>

      {/* POSTES CLASSIQUE */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Wrench size={18} />
          </div>
          <h2 className="text-base font-bold text-slate-800">
            {t("planning.workSettings.classiqueSection")}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label={t("planning.workSettings.shiftsPerDay")}
            type="number"
            min={1}
            max={6}
            value={settings.classique_shifts_per_day}
            onChange={(v) => patch("classique_shifts_per_day", Number(v) || 1)}
          />
          <Field
            label={t("planning.workSettings.shiftHours")}
            type="number"
            min={1}
            max={24}
            value={settings.classique_shift_hours}
            onChange={(v) => patch("classique_shift_hours", Number(v) || 8)}
          />
          <Field
            label={t("planning.workSettings.shiftStartTime")}
            type="time"
            value={settings.classique_shift_start_time}
            onChange={(v) => patch("classique_shift_start_time", v)}
          />
        </div>
      </div>

      {/* JOURS TRAVAILLÉS */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Calendar size={18} />
          </div>
          <h2 className="text-base font-bold text-slate-800">
            {t("planning.workSettings.workingDays")}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const active = settings.working_days.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => toggleDay(d.n)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                }`}
              >
                {t(d.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* CHEMIN DES DESSINS */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-700">
            <FolderOpen size={18} />
          </div>
          <h2 className="text-base font-bold text-slate-800">
            {t("planning.workSettings.drawingSection")}
          </h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {t("planning.workSettings.drawingBasePath")}
            </label>
            <input
              type="text"
              dir="ltr"
              value={settings.piece_drawing_base_path ?? ""}
              onChange={(e) => patch("piece_drawing_base_path", e.target.value || null)}
              placeholder="D:\\Dessins\\  ou  \\\\SERVER\\Dessins\\"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-400 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {t("planning.workSettings.drawingBasePathHint")}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {t("planning.workSettings.drawingPattern")}
            </label>
            <input
              type="text"
              dir="ltr"
              value={settings.piece_drawing_path_pattern ?? ""}
              onChange={(e) => patch("piece_drawing_path_pattern", e.target.value || null)}
              placeholder="{projectCode}/{pieceName}.pdf"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-400 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {t("planning.workSettings.drawingPatternHint")}
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {t("planning.workSettings.drawingPreview")}
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-700" dir="ltr">
              {pathPreview()}
            </div>
          </div>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw size={14} />
          {t("planning.workSettings.resetToDefaults")}
        </button>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {isSaving
            ? t("planning.workSettings.saving")
            : t("planning.workSettings.save")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composant
// ---------------------------------------------------------------------------
function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "time";
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">
        {label}
      </label>
      <input
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={type === "time" ? undefined : "ltr"}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}