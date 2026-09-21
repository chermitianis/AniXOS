import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Database, Mail, Sparkles, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";
import { AppLogo } from "../../../shared/components/AppLogo";
import { getPaddleConfig } from "../../../lib/paddleConfig";
import { BillingToggle, type BillingCycle } from "../components/BillingToggle";
import { PlanCard, PLAN_ICONS, type PlanDefinition } from "../components/PlanCard";

interface SubscriptionPageProps {
  onBack: () => void;
}

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

interface AccountInfo {
  email: string;
  subscription_status: string;
  plan: string;
  max_databases: number;
}

export function SubscriptionPage({ onBack }: SubscriptionPageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [databasesCount, setDatabasesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Gestion du checkout
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const paddleConfig = getPaddleConfig();

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);

      // الحصول على المستخدم الحالي — ضروري لتصفية accounts و databases
      const { data: { user } } = await supabase.auth.getUser();

      const [settingsRes, accountRes, dbsRes] = await Promise.all([
        supabase.rpc("get_platform_settings"),
        supabase
          .from("accounts")
          .select("email, subscription_status, plan, max_databases")
          .eq("id", user?.id ?? "")
          .maybeSingle(),
        supabase
          .from("databases")
          .select("id", { count: "exact", head: true })
          .eq("account_id", user?.id ?? ""),
      ]);

      if (!isMounted) return;

      if (settingsRes.data && settingsRes.data.length > 0) {
        setSettings(settingsRes.data[0] as PlatformSettings);
      }
      if (accountRes.data) {
        setAccount(accountRes.data as AccountInfo);
      }
      setDatabasesCount(dbsRes.count ?? 0);
      setIsLoading(false);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Démarre la procédure de paiement :
   *   1. Appelle l'Edge Function `create-checkout-session`.
   *   2. Reçoit une URL de Checkout Paddle.
   *   3. Redirige l'utilisateur.
   *
   * Si Paddle n'est pas encore configuré (VITE_PADDLE_VENDOR_ID absent),
   * affiche un message informatif au lieu d'échouer.
   */
  async function handleChoosePlan(planId: "standard" | "premium") {
    setCheckoutError(null);
  
    if (!paddleConfig.isConfigured) {
      alert(
        `💳 ${t("subscription.paddleNotConfigured")}\n\n` +
          `${t("subscription.paddleNotConfiguredBody")}`,
      );
      return;
    }
  
    setIsCheckingOut(true);
  
    try {
      // 1) Appeler l'Edge Function pour créer la transaction
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { plan: planId, billing_cycle: billing },
      });
  
      if (error || !data?.success || !data?.transaction_id) {
        let msg = data?.message ?? t("subscription.checkoutError");
        if (error && typeof error === "object" && "context" in error) {
          try {
            const ctx = (error as { context: Response }).context;
            const body = await ctx.json();
            msg = body?.message ?? msg;
          } catch {
            /* ignore */
          }
        }
        setCheckoutError(msg);
        return;
      }
  
      // 2) Initialiser Paddle.js
      const { initializePaddle } = await import("@paddle/paddle-js");
      const paddle = await initializePaddle({
        environment: "sandbox",
        token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string,
      });
  
      if (!paddle) {
        setCheckoutError(t("subscription.checkoutError"));
        return;
      }
  
      // 3) Ouvrir l'overlay Checkout Paddle
      paddle.Checkout.open({
        transactionId: data.transaction_id as string,
        settings: {
          displayMode: "overlay",
          theme: "light",
          locale: "fr",
          successUrl: `${window.location.origin}/?paddle=success`,
        },
      });
    } catch (err) {
      console.error("[SubscriptionPage:checkout]", err);
      setCheckoutError(t("subscription.checkoutError"));
    } finally {
      setIsCheckingOut(false);
    }
  }

  if (isLoading || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  const currency = settings.currency;
  const currentPlan = account?.plan ?? "trial";

  const plans: PlanDefinition[] = [
    {
      id: "trial",
      name: t("subscription.planTrial"),
      icon: PLAN_ICONS.trial,
      iconBg: "bg-slate-100 text-slate-600",
      priceMonthly: 0,
      priceYearly: 0,
      isCurrent: currentPlan === "trial",
      ctaLabel: currentPlan === "trial" ? t("subscription.currentPlanBadge") : t("subscription.choosePlanButton"),
      onCta: () => {},
      ctaDisabled: true,
      features: [
        { label: t("subscription.featuresMaxDatabases", { count: 1 }), included: true },
        { label: t("subscription.featuresMaxStaff", { count: 10 }), included: true },
        { label: t("subscription.featuresPwaWorker"), included: true },
        { label: t("subscription.featuresEmailSupport"), included: false },
        { label: t("subscription.featuresQRCode"), included: false },
        { label: t("subscription.featuresExportImport"), included: false },
      ],
    },
    {
      id: "standard",
      name: t("subscription.planStandard"),
      icon: PLAN_ICONS.standard,
      iconBg: "bg-indigo-100 text-indigo-600",
      priceMonthly: settings.standard_monthly_price,
      priceYearly: settings.standard_yearly_price,
      isCurrent: currentPlan === "standard",
      isPopular: true,
      ctaLabel: currentPlan === "standard" ? t("subscription.currentPlanBadge") : t("subscription.choosePlanButton"),
      onCta: () => void handleChoosePlan("standard"),
      ctaDisabled: isCheckingOut,
      features: [
        { label: t("subscription.featuresMaxDatabases", { count: settings.standard_max_databases }), included: true, highlight: true },
        { label: t("subscription.featuresMaxStaff", { count: settings.standard_max_staff }), included: true },
        { label: t("subscription.featuresPwaWorker"), included: true },
        { label: t("subscription.featuresEmailSupport"), included: true },
        { label: t("subscription.featuresQRCode"), included: false },
        { label: t("subscription.featuresExportImport"), included: true },
      ],
    },
    {
      id: "premium",
      name: t("subscription.planPremium"),
      icon: PLAN_ICONS.premium,
      iconBg: "bg-amber-100 text-amber-600",
      priceMonthly: settings.premium_monthly_price,
      priceYearly: settings.premium_yearly_price,
      isCurrent: currentPlan === "premium",
      ctaLabel: currentPlan === "premium" ? t("subscription.currentPlanBadge") : t("subscription.choosePlanButton"),
      onCta: () => void handleChoosePlan("premium"),
      ctaDisabled: isCheckingOut,
      features: [
        { label: t("subscription.featuresMaxDatabases", { count: settings.premium_max_databases }), included: true, highlight: true },
        { label: t("subscription.featuresMaxStaff", { count: settings.premium_max_staff }), included: true },
        { label: t("subscription.featuresPwaWorker"), included: true },
        { label: t("subscription.featuresPrioritySupport"), included: true },
        { label: t("subscription.featuresQRCode"), included: true, highlight: true },
        { label: t("subscription.featuresExportImport"), included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            {t("subscription.backToApp")}
          </button>

          <div className="flex items-center gap-2">
            <AppLogo size="sm" />
            <span className="text-sm font-extrabold tracking-tight text-slate-800">AniXOS</span>
          </div>

          <LanguageSwitcher />
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Hero */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-slate-800 md:text-3xl">
            {t("subscription.plansTitle")}
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-500">
            {t("subscription.plansSubtitle")}
          </p>
        </div>

        {/* Compte actuel */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {t("subscription.currentPlanBadge")}
                </p>
                <p className="text-sm font-bold text-slate-800">
                  {currentPlan === "trial"
                    ? t("subscription.planTrial")
                    : currentPlan === "standard"
                      ? t("subscription.planStandard")
                      : t("subscription.planPremium")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Mail size={14} />
                <span dir="ltr">{account?.email ?? staffUser?.email ?? "—"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Database size={14} />
                <span>
                  {databasesCount} / {account?.max_databases ?? settings.standard_max_databases}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Toggle */}
        <div className="mb-8 flex justify-center">
          <BillingToggle value={billing} onChange={setBilling} />
        </div>

        {/* Erreur de checkout */}
        {checkoutError && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} />
            {checkoutError}
          </div>
        )}

        {/* Plans */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} billing={billing} currency={currency} />
          ))}
        </div>

        {/* Note */}
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-xs text-amber-800">
          <Sparkles className="mx-auto mb-2 text-amber-500" size={18} />
          <p>
            {paddleConfig.isConfigured
              ? t("subscription.paymentNotice")
              : t("subscription.paddleNotConfiguredBody")}
          </p>
        </div>
      </main>
    </div>
  );
}