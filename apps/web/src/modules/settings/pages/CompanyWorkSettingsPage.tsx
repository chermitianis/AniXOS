import { useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Save, Clock, Cpu, Wrench, Calendar, FolderOpen, RotateCcw, Image as ImageIcon, Upload, X,
  Monitor, HardHat, Settings2, RefreshCw, Trash2, AlertTriangle, Plus,
} from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { supabase } from "../../../lib/supabaseClient";
import {
  getWorkSettings,
  saveWorkSettings,
  DEFAULT_WORK_SETTINGS,
  type WorkSettings,
} from "../../../shared/api/companyWorkSettingsApi";
import { getOrCreateFingerprint } from "../../../lib/deviceFingerprint";
import { registerCurrentDevice } from "../../../lib/deviceContext";

const DAYS: { n: number; labelKey: string }[] = [
  { n: 1, labelKey: "production.planning.workSettings.monday" },
  { n: 2, labelKey: "production.planning.workSettings.tuesday" },
  { n: 3, labelKey: "production.planning.workSettings.wednesday" },
  { n: 4, labelKey: "production.planning.workSettings.thursday" },
  { n: 5, labelKey: "production.planning.workSettings.friday" },
  { n: 6, labelKey: "production.planning.workSettings.saturday" },
  { n: 0, labelKey: "production.planning.workSettings.sunday" },
];

interface DeviceRow {
  id: string;
  device_name: string;
  device_mode: "admin" | "kiosk";
  is_active: boolean;
  last_seen_at: string | null;
  registered_at: string;
}

type TabKey = "settings" | "devices";

export function CompanyWorkSettingsPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [activeTab, setActiveTab] = useState<TabKey>("settings");

  const [settings, setSettings] = useState<WorkSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ✅ حالة الشعار
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ حالة الأجهزة
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [changingDeviceId, setChangingDeviceId] = useState<string | null>(null);
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<DeviceRow | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // ✅ الجهاز الحالي (للمقارنة)
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setCurrentDeviceId(localStorage.getItem("anixos_device_id"));
    } catch {
      setCurrentDeviceId(null);
    }
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const s = await getWorkSettings(companyId);
      setSettings(s);
      const { data: company } = await supabase
        .from("companies")
        .select("logo_url")
        .eq("id", companyId)
        .maybeSingle();
      setLogoUrl((company as { logo_url: string | null } | null)?.logo_url ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const loadDevices = useCallback(async () => {
    if (!companyId) return;
    setIsLoadingDevices(true);
    setDeviceError(null);
    try {
      const { data, error: dbError } = await supabase
        .from("devices")
        .select("id, device_name, device_mode, is_active, last_seen_at, registered_at")
        .eq("company_id", companyId)
        .order("registered_at", { ascending: false });

      if (dbError) throw dbError;
      setDevices((data as DeviceRow[]) ?? []);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoadingDevices(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (activeTab === "devices") {
      void loadDevices();
    }
  }, [activeTab, loadDevices]);

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

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    setLogoError(null);
    setIsUploadingLogo(true);

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Le fichier doit être une image.");
      }

      const fileExt = file.name.split('.').pop() || 'png';
      const filePath = `${companyId}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("company-logos")
        .getPublicUrl(filePath);

      const newLogoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: dbError } = await supabase
        .from("companies")
        .update({ logo_url: newLogoUrl })
        .eq("id", companyId);

      if (dbError) throw dbError;

      setLogoUrl(newLogoUrl);
    } catch (err) {
      console.error("Catch error:", err);
      setLogoError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (!companyId || !window.confirm(t("production.planning.workSettings.logoDeleteConfirm"))) return;
    setLogoError(null);
    setIsUploadingLogo(true);
    try {
      const { data: files } = await supabase.storage.from("company-logos").list(companyId);
      if (files && files.length > 0) {
        await supabase.storage.from("company-logos").remove(files.map(f => `${companyId}/${f.name}`));
      }
      await supabase.from("companies").update({ logo_url: null }).eq("id", companyId);
      setLogoUrl(null);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : t("production.planning.workSettings.logoError"));
    } finally {
      setIsUploadingLogo(false);
    }
  }

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

  function handleReset() {
    if (!window.confirm(t("production.planning.workSettings.confirmReset"))) return;
    if (!settings) return;
    setSettings({ ...settings, ...DEFAULT_WORK_SETTINGS });
  }

  function pathPreview(): string {
    if (!settings) return "—";
    const base = settings.piece_drawing_base_path ?? "";
    const pattern = settings.piece_drawing_path_pattern ?? "{projectCode}/{pieceName}.pdf";
    const example = pattern
      .replace("{projectCode}", "26090201")
      .replace("{pieceName}", "tasseau");
    return base ? `${base}${example}` : example;
  }

  // ✅ تغيير نوع الجهاز
  async function handleChangeDeviceMode(deviceId: string, newMode: "admin" | "kiosk") {
    if (!companyId) return;
    setDeviceError(null);
    setChangingDeviceId(deviceId);
    try {
      const { error: dbError } = await supabase
        .from("devices")
        .update({ device_mode: newMode })
        .eq("id", deviceId)
        .eq("company_id", companyId);

      if (dbError) throw dbError;

      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, device_mode: newMode } : d))
      );

      if (currentDeviceId === deviceId) {
        const confirmed = window.confirm(
          t("production.planning.workSettings.deviceModeChangedReload", {
            defaultValue:
              "Le mode de cet appareil a été modifié. L'application va se recharger pour appliquer le nouveau mode.",
          })
        );
        if (confirmed) {
          localStorage.removeItem("anixos_device_mode");
          window.location.reload();
        }
      }
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setChangingDeviceId(null);
    }
  }

  // ✅ حذف جهاز
  async function handleConfirmDeleteDevice() {
    if (!deviceToDelete || !companyId) return;
    setDeviceError(null);
    setDeletingDeviceId(deviceToDelete.id);
    try {
      await supabase
        .from("work_shifts")
        .update({ ended_at: new Date().toISOString() })
        .eq("device_id", deviceToDelete.id)
        .is("ended_at", null);

      const { error: dbError } = await supabase
        .from("devices")
        .delete()
        .eq("id", deviceToDelete.id)
        .eq("company_id", companyId);

      if (dbError) throw dbError;

      setDevices((prev) => prev.filter((d) => d.id !== deviceToDelete.id));
      setDeviceToDelete(null);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeletingDeviceId(null);
    }
  }

  // ✅ تسجيل الجهاز الحالي (إذا لم يكن مسجلاً)
  async function handleRegisterCurrentDevice() {
    if (!companyId) return;
    setDeviceError(null);
    setIsRegistering(true);
    try {
      const fingerprint = getOrCreateFingerprint();

      const { data: existing } = await supabase
        .from("devices")
        .select("id")
        .eq("company_id", companyId)
        .eq("device_fingerprint", fingerprint)
        .maybeSingle();

      if (existing) {
        setDeviceError(
          t("production.planning.workSettings.deviceAlreadyRegistered", {
            defaultValue: "Cet appareil est déjà enregistré.",
          })
        );
        return;
      }

      const name = window.prompt(
        t("production.planning.workSettings.deviceNamePrompt", {
          defaultValue: "Nom de cet appareil :",
        })
      );
      if (!name || !name.trim()) return;

      const result = await registerCurrentDevice(name.trim(), "admin");

      if (!result.success) {
        setDeviceError(result.message ?? "Erreur");
        return;
      }

      await loadDevices();
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsRegistering(false);
    }
  }

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
      {/* HEADER + TABS */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="p-4">
          <h1 className="text-lg font-extrabold text-slate-800">
            {t("production.planning.workSettings.title")}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {t("production.planning.workSettings.subtitle")}
          </p>
        </div>
        <div className="flex border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition ${
              activeTab === "settings"
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Settings2 size={16} />
            {t("production.planning.workSettings.tabSettings", {
              defaultValue: "Paramètres de travail",
            })}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("devices")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition ${
              activeTab === "devices"
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Monitor size={16} />
            {t("production.planning.workSettings.tabDevices", {
              defaultValue: "Appareils",
            })}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {t("production.planning.workSettings.saved")}
        </div>
      )}

      {/* TAB 1: PARAMÈTRES DE TRAVAIL */}
      {activeTab === "settings" && (
        <>
          {/* LOGO */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                <ImageIcon size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">{t("production.planning.workSettings.logoSection")}</h2>
                <p className="text-xs text-slate-500">{t("production.planning.workSettings.logoSubtitle")}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                  <button
                    onClick={handleRemoveLogo}
                    className="absolute -end-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-sm hover:bg-red-600"
                    title="Supprimer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400">
                  <ImageIcon size={48} />
                </div>
              )}

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={isUploadingLogo}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {isUploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {logoUrl ? t("production.planning.workSettings.logoChange") : t("production.planning.workSettings.logoUpload")}
                </button>
                <p className="mt-1 text-[11px] text-slate-400">
                  {t("production.planning.workSettings.logoHint")}
                </p>
                {logoError && <p className="mt-1 text-xs text-red-600">{logoError}</p>}
              </div>
            </div>
          </div>

          {/* POSTES CNC */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Cpu size={18} />
              </div>
              <h2 className="text-base font-bold text-slate-800">
                {t("production.planning.workSettings.cncSection")}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t("production.planning.workSettings.shiftsPerDay")} type="number" min={1} max={6} value={settings.cnc_shifts_per_day} onChange={(v) => patch("cnc_shifts_per_day", Number(v) || 1)} />
              <Field label={t("production.planning.workSettings.shiftHours")} type="number" min={1} max={24} value={settings.cnc_shift_hours} onChange={(v) => patch("cnc_shift_hours", Number(v) || 8)} />
              <Field label={t("production.planning.workSettings.shiftStartTime")} type="time" value={settings.cnc_shift_start_time} onChange={(v) => patch("cnc_shift_start_time", v)} />
            </div>
          </div>

          {/* POSTES CLASSIQUE */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Wrench size={18} />
              </div>
              <h2 className="text-base font-bold text-slate-800">
                {t("production.planning.workSettings.classiqueSection")}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t("production.planning.workSettings.shiftsPerDay")} type="number" min={1} max={6} value={settings.classique_shifts_per_day} onChange={(v) => patch("classique_shifts_per_day", Number(v) || 1)} />
              <Field label={t("production.planning.workSettings.shiftHours")} type="number" min={1} max={24} value={settings.classique_shift_hours} onChange={(v) => patch("classique_shift_hours", Number(v) || 8)} />
              <Field label={t("production.planning.workSettings.shiftStartTime")} type="time" value={settings.classique_shift_start_time} onChange={(v) => patch("classique_shift_start_time", v)} />
            </div>
          </div>

          {/* JOURS TRAVAILLÉS */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Calendar size={18} />
              </div>
              <h2 className="text-base font-bold text-slate-800">
                {t("production.planning.workSettings.workingDays")}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const active = settings.working_days.includes(d.n);
                return (
                  <button key={d.n} type="button" onClick={() => toggleDay(d.n)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"}`}>
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
                {t("production.planning.workSettings.drawingSection")}
              </h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{t("production.planning.workSettings.drawingBasePath")}</label>
                <input type="text" dir="ltr" value={settings.piece_drawing_base_path ?? ""} onChange={(e) => patch("piece_drawing_base_path", e.target.value || null)} placeholder="D:\\Dessins\\  ou  \\\\SERVER\\Dessins\\" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-400 focus:outline-none" />
                <p className="mt-1 text-[11px] text-slate-400">{t("production.planning.workSettings.drawingBasePathHint")}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{t("production.planning.workSettings.drawingPattern")}</label>
                <input type="text" dir="ltr" value={settings.piece_drawing_path_pattern ?? ""} onChange={(e) => patch("piece_drawing_path_pattern", e.target.value || null)} placeholder="{projectCode}/{pieceName}.pdf" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-400 focus:outline-none" />
                <p className="mt-1 text-[11px] text-slate-400">{t("production.planning.workSettings.drawingPatternHint")}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("production.planning.workSettings.drawingPreview")}</div>
                <div className="mt-0.5 font-mono text-xs text-slate-700" dir="ltr">{pathPreview()}</div>
              </div>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4">
            <button type="button" onClick={handleReset} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <RotateCcw size={14} /> {t("production.planning.workSettings.resetToDefaults")}
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {isSaving ? t("production.planning.workSettings.saving") : t("production.planning.workSettings.save")}
            </button>
          </div>
        </>
      )}

      {/* TAB 2: APPAREILS */}
      {activeTab === "devices" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Monitor size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {t("production.planning.workSettings.devicesTitle", {
                    defaultValue: "Appareils de l'entreprise",
                  })}
                </h2>
                <p className="text-xs text-slate-500">
                  {t("production.planning.workSettings.devicesSubtitle", {
                    defaultValue:
                      "Gérez le type de chaque appareil enregistré dans votre entreprise.",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRegisterCurrentDevice()}
                disabled={isRegistering || isLoadingDevices}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isRegistering ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                {t("production.planning.workSettings.registerCurrentDevice", {
                  defaultValue: "Enregistrer cet appareil",
                })}
              </button>
              <button
                type="button"
                onClick={() => void loadDevices()}
                disabled={isLoadingDevices}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={14} className={isLoadingDevices ? "animate-spin" : ""} />
                {t("common.refresh", { defaultValue: "Actualiser" })}
              </button>
            </div>
          </div>

          {deviceError && (
            <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {deviceError}
            </div>
          )}

          {isLoadingDevices ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="me-2 animate-spin" size={18} />
              {t("common.loading")}
            </div>
          ) : devices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-400">
              {t("production.planning.workSettings.devicesEmpty", {
                defaultValue: "Aucun appareil enregistré pour le moment.",
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">
                      {t("production.planning.workSettings.deviceName", {
                        defaultValue: "Nom de l'appareil",
                      })}
                    </th>
                    <th className="px-3 py-2">
                      {t("production.planning.workSettings.deviceType", {
                        defaultValue: "Type",
                      })}
                    </th>
                    <th className="px-3 py-2">
                      {t("production.planning.workSettings.deviceStatus", {
                        defaultValue: "Statut",
                      })}
                    </th>
                    <th className="px-3 py-2">
                      {t("production.planning.workSettings.deviceLastSeen", {
                        defaultValue: "Dernière activité",
                      })}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("production.planning.workSettings.deviceActions", {
                        defaultValue: "Actions",
                      })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => {
                    const isCurrent = device.id === currentDeviceId;
                    const isChanging = changingDeviceId === device.id;
                    const isDeleting = deletingDeviceId === device.id;
                    const isAdmin = device.device_mode === "admin";

                    return (
                      <tr
                        key={device.id}
                        className={`border-b border-slate-100 last:border-0 ${
                          isCurrent ? "bg-indigo-50/50" : ""
                        }`}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {isAdmin ? (
                              <Monitor size={16} className="text-indigo-600" />
                            ) : (
                              <HardHat size={16} className="text-amber-600" />
                            )}
                            <span className="font-semibold text-slate-800">
                              {device.device_name}
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                {t("production.planning.workSettings.currentDevice", {
                                  defaultValue: "Cet appareil",
                                })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                              isAdmin
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {isAdmin
                              ? t("production.planning.workSettings.deviceAdmin", {
                                  defaultValue: "Administratif",
                                })
                              : t("production.planning.workSettings.deviceAtelier", {
                                  defaultValue: "Atelier",
                                })}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold ${
                              device.is_active ? "text-emerald-600" : "text-slate-400"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                device.is_active ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                            />
                            {device.is_active
                              ? t("common.active", { defaultValue: "Actif" })
                              : t("common.inactive", { defaultValue: "Inactif" })}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {device.last_seen_at
                            ? new Date(device.last_seen_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void handleChangeDeviceMode(
                                  device.id,
                                  isAdmin ? "kiosk" : "admin"
                                )
                              }
                              disabled={isChanging || isDeleting}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                                isAdmin
                                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                  : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                              }`}
                            >
                              {isChanging ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <>
                                  {isAdmin ? (
                                    <HardHat size={12} />
                                  ) : (
                                    <Monitor size={12} />
                                  )}
                                </>
                              )}
                              {isAdmin
                                ? t("production.planning.workSettings.switchToAtelier", {
                                    defaultValue: "Passer en Atelier",
                                  })
                                : t("production.planning.workSettings.switchToAdmin", {
                                    defaultValue: "Passer en Administratif",
                                  })}
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeviceToDelete(device)}
                              disabled={isCurrent || isDeleting || isChanging}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                              title={
                                isCurrent
                                  ? t("production.planning.workSettings.cannotDeleteCurrent", {
                                      defaultValue: "Impossible de supprimer l'appareil actuel",
                                    })
                                  : t("common.delete", { defaultValue: "Supprimer" })
                              }
                            >
                              {isDeleting ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                              {t("common.delete", { defaultValue: "Supprimer" })}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ✅ نافذة تأكيد حذف الجهاز */}
      {deviceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {t("production.planning.workSettings.deleteDeviceTitle", {
                    defaultValue: "Supprimer cet appareil ?",
                  })}
                </h3>
                <p className="text-sm text-slate-500">
                  {deviceToDelete.device_name}
                </p>
              </div>
            </div>
            <p className="mb-6 text-sm text-slate-600">
              {t("production.planning.workSettings.deleteDeviceWarning", {
                defaultValue:
                  "Cette action est irréversible. L'appareil sera supprimé et toutes ses sessions actives seront fermées. Cette action est tracée et visible dans les rapports.",
              })}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeviceToDelete(null)}
                disabled={deletingDeviceId !== null}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteDevice()}
                disabled={deletingDeviceId !== null}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-red-200 hover:bg-red-700 disabled:opacity-50"
              >
                {deletingDeviceId ? (
                  <Loader2 size={16} className="mx-auto animate-spin" />
                ) : (
                  t("common.delete", { defaultValue: "Supprimer" })
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", min, max }: { label: string; value: string | number; onChange: (v: string) => void; type?: "text" | "number" | "time"; min?: number; max?: number; }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
      <input type={type} min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} dir={type === "time" ? undefined : "ltr"} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
    </div>
  );
}