import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Plug, PlugZap, Loader2, CheckCircle2, XCircle, Eye, EyeOff,
  Server, KeyRound, User, Database as DatabaseIcon,
  Save, TestTube2, ShieldAlert, Crown, RefreshCw,
  ChevronDown, ChevronUp,
  Factory, FolderKanban, ClipboardList, Users, Users2, Calendar, Cog,
  Truck, FileText, Boxes, HardHat, ListChecks, ArrowLeft, ArrowRight, ArrowLeftRight,
} from "lucide-react";
import {
  useOdooConfig,
  DEFAULT_SYNC_MODULES,
  ALL_SYNC_MODULES,
  normalizeSyncModules, // ✅ دالة التحويل
  type SyncModule,
  type SyncModulesMatrix, // ✅ البنية الجديدة
  type SyncDirection,
} from "../hooks/useOdooConfig";

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------
interface FormState {
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  api_key: string;
  sync_modules: SyncModulesMatrix; // ✅ البنية الجديدة
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  notify_on_error: boolean;
}

const INITIAL_FORM: FormState = {
  odoo_url: "",
  odoo_db: "",
  odoo_username: "",
  api_key: "",
  sync_modules: { ...DEFAULT_SYNC_MODULES },
  auto_sync_enabled: false,
  auto_sync_interval_minutes: 60,
  notify_on_error: true,
};

// ---------------------------------------------------------------------------
// UI configuration
// ---------------------------------------------------------------------------
const MODULE_ICONS: Record<SyncModule, typeof Factory> = {
  clients: Users2,
  suppliers: Truck,
  invoices: FileText,
  projects: FolderKanban,
  manufacturing_orders: ClipboardList,
  work_orders: ListChecks,
  planning: Calendar,
  machines: Cog,
  workcenters: Factory,
  workers: HardHat,
  staff: Users,
  materials: Boxes,
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const ODOO_PRIMARY = "#714B67";
const ODOO_LIGHT = "#9B6F94";
const ODOO_GREEN = "#10b981";
const ODOO_GREEN_DARK = "#059669";
const ODOO_GREEN_BG = "#f0fdf4";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function OdooIntegrationPanel() {
  const { t } = useTranslation();
  const {
    config, isLoading, isSaving, isSyncing,
    saveConfig, toggleActive, testConnection, syncNow,
  } = useOdooConfig();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isTogglingNow, setIsTogglingNow] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    if (!config) return;
    // ✅ استخدام normalizeSyncModules للتعامل مع البنية القديمة والجديدة
    const normalizedModules = normalizeSyncModules(config.sync_modules);
    setForm({
      odoo_url: config.odoo_url ?? "",
      odoo_db: config.odoo_db ?? "",
      odoo_username: config.odoo_username ?? "",
      api_key: "",
      sync_modules: normalizedModules,
      auto_sync_enabled: config.auto_sync_enabled ?? false,
      auto_sync_interval_minutes: config.auto_sync_interval_minutes ?? 60,
      notify_on_error: config.notify_on_error ?? true,
    });
  }, [config]);

  const isActive = config?.is_active ?? false;
  const hasConfig = !!config;
  const showForm = isFormOpen;

  const isFormValid = useMemo(() => {
    return (
      form.odoo_url.trim().length > 0 &&
      form.odoo_db.trim().length > 0 &&
      form.odoo_username.trim().length > 0 &&
      (form.api_key.trim().length > 0 || hasConfig)
    );
  }, [form, hasConfig]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  }

  // ✅ تحديث مصفوفة الوحدات (Pull/Push)
  function toggleModuleDirection(mod: SyncModule, direction: "pull" | "push") {
    setForm((prev) => ({
      ...prev,
      sync_modules: {
        ...prev.sync_modules,
        [mod]: {
          ...prev.sync_modules[mod],
          [direction]: !prev.sync_modules[mod][direction],
        },
      },
    }));
  }

  async function handleToggleClick() {
    if (isTogglingNow || isLoading) return;

    if (isActive) {
      setIsTogglingNow(true);
      try {
        const result = await toggleActive();
        if (!result.success) {
          setTestResult({ ok: false, message: result.error ?? "Erreur" });
        } else {
          setTestResult({ ok: true, message: t("odoo.deactivateSuccess") });
          setIsFormOpen(false);
        }
      } finally {
        setIsTogglingNow(false);
      }
      return;
    }

    if (isFormOpen) {
      setIsFormOpen(false);
      setTestResult(null);
      return;
    }

    setIsFormOpen(true);
    setTestResult(null);
  }

  async function handleSaveAndActivate(e: FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    setTestResult(null);

    const saveResult = await saveConfig({
      ...form,
      api_key: form.api_key || undefined,
    });
    if (!saveResult.success) {
      setTestResult({ ok: false, message: saveResult.error ?? "Erreur" });
      return;
    }

    if (!isActive) {
      const toggleResult = await toggleActive();
      if (!toggleResult.success) {
        setTestResult({ ok: false, message: toggleResult.error ?? "Erreur" });
        return;
      }
    }

    setTestResult({ ok: true, message: t("odoo.saveSuccess") });
    setForm((prev) => ({ ...prev, api_key: "" }));
    setIsFormOpen(false);
  }

  async function handleTest() {
    if (!isFormValid) {
      setTestResult({ ok: false, message: t("odoo.testMissingFields") });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({
        odoo_url: form.odoo_url,
        odoo_db: form.odoo_db,
        odoo_username: form.odoo_username,
        api_key: form.api_key || undefined,
      });
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  }

  function handleToggleChevron() {
    setIsFormOpen((v) => !v);
  }

  async function handleSyncNow() {
    setTestResult(null);
    const result = await syncNow();
    if (!result.success) {
      setTestResult({ ok: false, message: result.error ?? t("odoo.syncError") });
    } else {
      setTestResult({
        ok: true,
        message: t("odoo.syncSuccess", { count: result.totalSynced ?? 0 }),
      });
    }
  }

  const toggleVisualOn = isActive || isFormOpen;

  return (
    <div className="space-y-5">
      <div
        className="overflow-hidden rounded-xl border-2 transition-colors"
        style={{
          borderColor: isActive
            ? ODOO_PRIMARY
            : toggleVisualOn
              ? ODOO_GREEN
              : "#e2e8f0",
          background: toggleVisualOn ? ODOO_GREEN_BG : "white",
        }}
      >
        {/* Header */}
        <div
          onClick={hasConfig ? handleToggleChevron : undefined}
          className={`flex items-start justify-between gap-4 p-5 transition-colors ${
            hasConfig ? "cursor-pointer" : ""
          }`}
          style={{
            background: isActive
              ? `linear-gradient(135deg, ${ODOO_PRIMARY}15, ${ODOO_LIGHT}08)`
              : toggleVisualOn
                ? `${ODOO_GREEN}10`
                : "transparent",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-all"
              style={{
                background: toggleVisualOn
                  ? `linear-gradient(135deg, ${ODOO_GREEN}, ${ODOO_GREEN_DARK})`
                  : "#94a3b8",
              }}
            >
              <Plug size={20} />
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-800">
                {t("odoo.title")}
                {isActive && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: ODOO_GREEN }}
                  >
                    <CheckCircle2 size={10} />
                    {t("odoo.badgeConnected")}
                    {config?.version && (
                      <span className="opacity-90">· v{config.version}</span>
                    )}
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{t("odoo.subtitle")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasConfig && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleChevron();
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                {isFormOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleToggleClick();
              }}
              disabled={isLoading || isTogglingNow}
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50"
              style={{ background: toggleVisualOn ? ODOO_GREEN : "#cbd5e1" }}
              role="switch"
              aria-checked={toggleVisualOn}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200"
                style={{
                  transform: toggleVisualOn ? "translateX(22px)" : "translateX(2px)",
                }}
              />
              {isTogglingNow && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={12} className="animate-spin text-white" />
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Source of truth banner */}
        {isActive && !isFormOpen && (
          <div
            className="flex items-center justify-between gap-2 border-t px-5 py-2.5 text-xs"
            style={{
              background: `${ODOO_PRIMARY}08`,
              borderColor: `${ODOO_PRIMARY}20`,
              color: ODOO_PRIMARY,
            }}
          >
            <div className="flex items-center gap-2">
              <Crown size={14} className="shrink-0" />
              <span className="font-bold">{t("odoo.sourceOfTruth")}</span>
              <span className="opacity-70">·</span>
              <span className="opacity-80">{t("odoo.sourceOfTruthHint")}</span>
            </div>
            <div className="flex items-center gap-2">
              {config?.last_sync_at && (
                <span className="text-[11px] opacity-70">
                  {t("odoo.lastSync")} : {new Date(config.last_sync_at).toLocaleString()}
                  {config.last_sync_status === "failed" && (
                    <span className="ms-1 font-bold text-red-600">
                      · {t("odoo.lastSyncFailed")}
                    </span>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSyncNow();
                }}
                disabled={isSyncing}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"
                style={{ background: ODOO_PRIMARY }}
              >
                {isSyncing ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
                {t("odoo.syncNow")}
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSaveAndActivate} className="space-y-5 border-t border-slate-100 p-5">
            {/* Credentials */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <Server size={13} />
                {t("odoo.sectionCredentials")}
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Server size={12} />
                    {t("odoo.url")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={form.odoo_url}
                    onChange={(e) => updateField("odoo_url", e.target.value)}
                    placeholder="https://mycompany.odoo.com"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": `${ODOO_PRIMARY}30` } as React.CSSProperties}
                    dir="ltr"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">{t("odoo.urlHint")}</p>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <DatabaseIcon size={12} />
                    {t("odoo.db")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.odoo_db}
                    onChange={(e) => updateField("odoo_db", e.target.value)}
                    placeholder="mycompany"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": `${ODOO_PRIMARY}30` } as React.CSSProperties}
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <User size={12} />
                    {t("odoo.username")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.odoo_username}
                    onChange={(e) => updateField("odoo_username", e.target.value)}
                    placeholder="user@company.com"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": `${ODOO_PRIMARY}30` } as React.CSSProperties}
                    dir="ltr"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <KeyRound size={12} />
                    {t("odoo.apiKey")} {!hasConfig && <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={form.api_key}
                      onChange={(e) => updateField("api_key", e.target.value)}
                      placeholder={hasConfig ? t("odoo.apiKeyPlaceholderExisting") : "••••••••••••••••"}
                      required={!hasConfig}
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 ps-3 pe-10 text-sm font-mono focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": `${ODOO_PRIMARY}30` } as React.CSSProperties}
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{t("odoo.apiKeyHint")}</p>
                </div>
              </div>
            </div>

            {/* ✅ Modules Matrix (Pull/Push لكل وحدة) */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <Plug size={13} />
                {t("odoo.sectionModules")}
              </h3>

              {/* رأس الجدول */}
              <div className="mb-2 grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-200 pb-2 text-[10px] font-bold uppercase text-slate-400">
                <span>Module</span>
                <span className="w-16 text-center">Pull ↓</span>
                <span className="w-16 text-center">Push ↑</span>
              </div>

              {/* صفوف الجدول */}
              <div className="space-y-1.5">
                {ALL_SYNC_MODULES.map((key) => {
                  const Icon = MODULE_ICONS[key];
                  const dir = form.sync_modules[key];
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-slate-500" />
                        <span className="text-xs font-medium text-slate-700">
                          {t(`odoo.module.${key}`)}
                        </span>
                      </div>

                      {/* Pull */}
                      <label className="flex w-16 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={dir.pull}
                          onChange={() => toggleModuleDirection(key, "pull")}
                          className="h-4 w-4 rounded border-slate-300"
                          style={{ accentColor: ODOO_PRIMARY }}
                          title="Pull (Odoo → AniXOS)"
                        />
                      </label>

                      {/* Push */}
                      <label className="flex w-16 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={dir.push}
                          onChange={() => toggleModuleDirection(key, "push")}
                          className="h-4 w-4 rounded border-slate-300"
                          style={{ accentColor: ODOO_PRIMARY }}
                          title="Push (AniXOS → Odoo)"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Automation */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <RefreshCw size={13} />
                {t("odoo.sectionAutomation")}
              </h3>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-700">{t("odoo.autoSync")}</span>
                    <span className="text-[11px] text-slate-400">{t("odoo.autoSyncHint")}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.auto_sync_enabled}
                    onChange={(e) => updateField("auto_sync_enabled", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                    style={{ accentColor: ODOO_PRIMARY }}
                  />
                </label>
                {form.auto_sync_enabled && (
                  <div className="ps-3">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      {t("odoo.interval")}
                    </label>
                    <select
                      value={form.auto_sync_interval_minutes}
                      onChange={(e) => updateField("auto_sync_interval_minutes", Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": `${ODOO_PRIMARY}30` } as React.CSSProperties}
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={60}>1 h</option>
                      <option value={180}>3 h</option>
                      <option value={360}>6 h</option>
                      <option value={720}>12 h</option>
                      <option value={1440}>24 h</option>
                    </select>
                  </div>
                )}
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-700">{t("odoo.notifyOnError")}</span>
                    <span className="text-[11px] text-slate-400">{t("odoo.notifyOnErrorHint")}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.notify_on_error}
                    onChange={(e) => updateField("notify_on_error", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                    style={{ accentColor: ODOO_PRIMARY }}
                  />
                </label>
              </div>
            </div>

            {/* Test result */}
            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${
                  testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                ) : (
                  <XCircle size={14} className="mt-0.5 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={isTesting || isLoading || !isFormValid}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isTesting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t("odoo.testing")}
                  </>
                ) : (
                  <>
                    <TestTube2 size={14} />
                    {t("odoo.testConnection")}
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={!isFormValid || isSaving || isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed"
                style={{ background: !isFormValid ? "#cbd5e1" : ODOO_PRIMARY }}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t("common.saving")}
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    {isActive ? t("common.save") : t("odoo.saveAndEnable")}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Security note */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <span>{t("odoo.securityNote")}</span>
      </div>
    </div>
  );
}