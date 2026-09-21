import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Plug, PlugZap, Loader2, CheckCircle2, XCircle, Eye, EyeOff,
  Server, KeyRound, User, Database as DatabaseIcon,
  Save, TestTube2, ShieldAlert, Crown, Send, RefreshCw, ChevronDown, ChevronUp,
  Factory, FolderKanban, ClipboardList, Users, Users2, Calendar, Cog,
  Truck, FileText, Boxes, HardHat, ListChecks,
} from "lucide-react";
import { useOdooConfig } from "../hooks/useOdooConfig";

type SyncModule =
  | "clients"
  | "suppliers"
  | "projects"
  | "manufacturing_orders"
  | "work_orders"
  | "machines"
  | "workcenters"
  | "workers"
  | "staff"
  | "planning"
  | "materials"
  | "invoices";

type SyncDirection = "pull" | "push" | "bidirectional";

interface FormState {
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  api_key: string;
  sync_modules: Record<SyncModule, boolean>;
  sync_direction: SyncDirection;
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  notify_on_error: boolean;
}

const ALL_MODULES_OFF: Record<SyncModule, boolean> = {
  clients: true,
  suppliers: false,
  projects: false,
  manufacturing_orders: false,
  work_orders: false,
  machines: false,
  workcenters: false,
  workers: false,
  staff: false,
  planning: false,
  materials: false,
  invoices: false,
};

const INITIAL_FORM: FormState = {
  odoo_url: "",
  odoo_db: "",
  odoo_username: "",
  api_key: "",
  sync_modules: { ...ALL_MODULES_OFF },
  sync_direction: "pull",
  auto_sync_enabled: false,
  auto_sync_interval_minutes: 60,
  notify_on_error: true,
};

const SYNC_MODULES_UI: { key: SyncModule; icon: typeof Factory }[] = [
  { key: "clients", icon: Users2 },
  { key: "suppliers", icon: Truck },
  { key: "invoices", icon: FileText },
  { key: "projects", icon: FolderKanban },
  { key: "manufacturing_orders", icon: ClipboardList },
  { key: "work_orders", icon: ListChecks },
  { key: "planning", icon: Calendar },
  { key: "machines", icon: Cog },
  { key: "workcenters", icon: Factory },
  { key: "workers", icon: HardHat },
  { key: "staff", icon: Users },
  { key: "materials", icon: Boxes },
];

const SYNC_DIRECTIONS: SyncDirection[] = ["pull", "push", "bidirectional"];

const ODOO_PRIMARY = "#714B67";
const ODOO_LIGHT = "#9B6F94";
const ODOO_GREEN = "#10b981";
const ODOO_GREEN_DARK = "#059669";
const ODOO_GREEN_BG = "#f0fdf4";

export function OdooIntegrationPanel() {
  const { t } = useTranslation();
  const { config, isLoading, isSaving, saveConfig, toggleActive, testConnection } = useOdooConfig();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isTogglingNow, setIsTogglingNow] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    if (!config) return;
    setForm({
      odoo_url: config.odoo_url ?? "",
      odoo_db: config.odoo_db ?? "",
      odoo_username: config.odoo_username ?? "",
      api_key: "",
      sync_modules: {
        clients: config.sync_modules?.clients ?? true,
        suppliers: config.sync_modules?.suppliers ?? false,
        projects: config.sync_modules?.projects ?? false,
        manufacturing_orders: config.sync_modules?.manufacturing_orders ?? false,
        work_orders: config.sync_modules?.work_orders ?? false,
        machines: config.sync_modules?.machines ?? false,
        workcenters: config.sync_modules?.workcenters ?? false,
        workers: config.sync_modules?.workers ?? false,
        staff: config.sync_modules?.staff ?? false,
        planning: config.sync_modules?.planning ?? false,
        materials: config.sync_modules?.materials ?? false,
        invoices: config.sync_modules?.invoices ?? false,
      },
      sync_direction: config.sync_direction ?? "pull",
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

  function toggleModule(mod: SyncModule) {
    setForm((prev) => ({
      ...prev,
      sync_modules: { ...prev.sync_modules, [mod]: !prev.sync_modules[mod] },
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

    setTestResult(null);
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

  // ⚡ toggle visual : ON si actif OU formulaire ouvert (brouillon)
  const toggleVisualOn = isActive || isFormOpen;

  return (
    <div className="space-y-5">
      {/* Carte principale — fond vert clair si ON */}
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
            {/* Icône Plug — vert si ON, gris si OFF */}
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

        {/* Bandeau source de vérité (si actif ET replié) */}
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
            {config?.last_sync_at && (
              <span className="text-[11px] opacity-70">
                {t("odoo.lastSync")} : {new Date(config.last_sync_at).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Formulaire */}
        {showForm && (
          <form onSubmit={handleSaveAndActivate} className="space-y-5 border-t border-slate-100 p-5">
            {/* Identifiants */}
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

            {/* Modules */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <Plug size={13} />
                {t("odoo.sectionModules")}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SYNC_MODULES_UI.map(({ key, icon: Icon }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs transition-all hover:bg-slate-50"
                    style={
                      form.sync_modules[key]
                        ? { borderColor: ODOO_PRIMARY, background: `${ODOO_PRIMARY}08` }
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={form.sync_modules[key]}
                      onChange={() => toggleModule(key)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                      style={{ accentColor: ODOO_PRIMARY }}
                    />
                    <Icon
                      size={14}
                      className={form.sync_modules[key] ? "" : "text-slate-400"}
                      style={form.sync_modules[key] ? { color: ODOO_PRIMARY } : undefined}
                    />
                    <span className="text-xs font-medium text-slate-700">
                      {t(`odoo.module.${key}`)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Direction */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <PlugZap size={13} />
                {t("odoo.sectionDirection")}
              </h3>
              <div className="grid gap-2 sm:grid-cols-3">
                {SYNC_DIRECTIONS.map((dir) => (
                  <label
                    key={dir}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 transition-all ${
                      form.sync_direction === dir ? "ring-1" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    style={
                      form.sync_direction === dir
                        ? {
                            borderColor: ODOO_PRIMARY,
                            background: `${ODOO_PRIMARY}08`,
                            "--tw-ring-color": `${ODOO_PRIMARY}40`,
                          } as React.CSSProperties
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="sync_direction"
                        value={dir}
                        checked={form.sync_direction === dir}
                        onChange={() => updateField("sync_direction", dir)}
                        className="h-3.5 w-3.5"
                        style={{ accentColor: ODOO_PRIMARY }}
                      />
                      <span className="text-xs font-bold text-slate-700">
                        {t(`odoo.direction.${dir}.label`)}
                      </span>
                    </div>
                    <span className="ps-5 text-[10px] text-slate-400">
                      {t(`odoo.direction.${dir}.hint`)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Automatisation */}
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

            {/* Résultat test */}
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

            {/* Boutons */}
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

      {/* Envoyer les rapports */}
      {isActive &&
        (config?.sync_direction === "push" || config?.sync_direction === "bidirectional") && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border p-4"
            style={{ borderColor: `${ODOO_PRIMARY}40`, background: `${ODOO_PRIMARY}08` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ background: ODOO_PRIMARY }}
              >
                <Send size={16} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">{t("odoo.pushReports.title")}</p>
                <p className="text-[11px] text-slate-500">{t("odoo.pushReports.subtitle")}</p>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm"
              style={{ background: ODOO_PRIMARY }}
            >
              {t("odoo.pushReports.button")}
            </button>
          </div>
        )}

      {/* Note sécurité */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <span>{t("odoo.securityNote")}</span>
      </div>
    </div>
  );
}