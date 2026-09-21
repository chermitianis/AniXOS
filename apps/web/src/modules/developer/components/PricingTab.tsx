import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Save, RotateCcw, AlertCircle, CheckCircle2, DollarSign } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

interface PlatformSettings {
  currency: string;
  trial_days: number;
  standard_monthly_price: number;
  standard_yearly_price: number;
  premium_monthly_price: number;
  premium_yearly_price: number;
  standard_max_databases: number;
  standard_max_staff: number;
  premium_max_databases: number;
  premium_max_staff: number;
}

const EMPTY: PlatformSettings = {
  currency: "TND",
  trial_days: 60,
  standard_monthly_price: 0,
  standard_yearly_price: 0,
  premium_monthly_price: 0,
  premium_yearly_price: 0,
  standard_max_databases: 3,
  standard_max_staff: 20,
  premium_max_databases: 5,
  premium_max_staff: 50,
};

export function PricingTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PlatformSettings>(EMPTY);
  const [original, setOriginal] = useState<PlatformSettings>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Charger les paramètres actuels
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const { data, error } = await supabase.rpc("get_platform_settings");
      if (isMounted) {
        if (!error && data && data.length > 0) {
          const row = data[0] as PlatformSettings;
          setSettings(row);
          setOriginal(row);
        }
        setIsLoading(false);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  function update<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleReset() {
    setSettings(original);
    setSuccessMsg(null);
    setErrorMsg(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      // Récupérer l'ID du singleton
      const { data: current } = await supabase
        .from("platform_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (!current) {
        setErrorMsg(t("developer.pricing.noSingleton"));
        return;
      }

      const { error } = await supabase
        .from("platform_settings")
        .update({
          currency: settings.currency,
          trial_days: settings.trial_days,
          standard_monthly_price: settings.standard_monthly_price,
          standard_yearly_price: settings.standard_yearly_price,
          premium_monthly_price: settings.premium_monthly_price,
          premium_yearly_price: settings.premium_yearly_price,
          standard_max_databases: settings.standard_max_databases,
          standard_max_staff: settings.standard_max_staff,
          premium_max_databases: settings.premium_max_databases,
          premium_max_staff: settings.premium_max_staff,
        })
        .eq("id", current.id);

      if (error) {
        console.error("[PricingTab]", error);
        setErrorMsg(error.message);
        return;
      }

      setOriginal(settings);
      setSuccessMsg(t("developer.pricing.saved"));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error("[PricingTab]", err);
      setErrorMsg(t("developer.pricing.saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>;
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <DollarSign size={22} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-slate-800">
              {t("developer.pricing.title")}
            </h2>
            <p className="text-xs text-slate-400">{t("developer.pricing.subtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Save size={14} />
            {isSaving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Section 1: Général */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">
          {t("developer.pricing.sectionGeneral")}
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.currency")}
            </label>
            <input
              type="text"
              value={settings.currency}
              onChange={(e) => update("currency", e.target.value.toUpperCase())}
              placeholder="TND, EUR, USD..."
              className={inputClass}
              dir="ltr"
              maxLength={5}
              required
            />
            <p className="mt-1 text-xs text-slate-400">{t("developer.pricing.currencyHint")}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.trialDays")}
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={settings.trial_days}
              onChange={(e) => update("trial_days", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
            <p className="mt-1 text-xs text-slate-400">{t("developer.pricing.trialDaysHint")}</p>
          </div>
        </div>
      </div>

      {/* Section 2: Standard */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-5">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-indigo-600">
          {t("subscription.planStandard")}
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.monthlyPrice")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.standard_monthly_price}
              onChange={(e) => update("standard_monthly_price", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.yearlyPrice")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.standard_yearly_price}
              onChange={(e) => update("standard_yearly_price", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.maxDatabases")}
            </label>
            <input
              type="number"
              min="1"
              max="999"
              value={settings.standard_max_databases}
              onChange={(e) => update("standard_max_databases", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.maxStaff")}
            </label>
            <input
              type="number"
              min="1"
              max="999"
              value={settings.standard_max_staff}
              onChange={(e) => update("standard_max_staff", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
          </div>
        </div>
      </div>

      {/* Section 3: Premium */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-amber-600">
          {t("subscription.planPremium")}
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.monthlyPrice")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.premium_monthly_price}
              onChange={(e) => update("premium_monthly_price", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.yearlyPrice")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.premium_yearly_price}
              onChange={(e) => update("premium_yearly_price", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.maxDatabases")}
            </label>
            <input
              type="number"
              min="1"
              max="999"
              value={settings.premium_max_databases}
              onChange={(e) => update("premium_max_databases", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t("developer.pricing.maxStaff")}
            </label>
            <input
              type="number"
              min="1"
              max="999"
              value={settings.premium_max_staff}
              onChange={(e) => update("premium_max_staff", Number(e.target.value))}
              className={inputClass}
              dir="ltr"
              required
            />
          </div>
        </div>
      </div>

      {/* Note */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p>{t("developer.pricing.note")}</p>
      </div>
    </form>
  );
}