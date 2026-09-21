import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clock, AlertTriangle, Ban, RotateCcw } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { LanguageSwitcher } from "../shared/components/LanguageSwitcher";
import type { CompanySubscriptionStatus } from "../shared/types/database";

interface SubscriptionGateProps {
  children: ReactNode;
  onLogout: () => void;
  /** اختياري — يُستدعى عند الضغط على "تجديد الاشتراك" */
  onRenew?: () => void;
}

/**
 * بوابة الاشتراك: تُغلِّف كامل التطبيق (إداري وكشك) بعد تحديد الشركة.
 *
 * - trial_active → يمرّر الأطفال + يعرض شارة أيام متبقية في شريط علوي رفيع.
 * - trial_expired / suspended / cancelled → يحجب الوصول.
 * - developer → يتجاوز كل الفحوصات.
 *
 * البيانات نفسها تبقى محفوظة بالكامل، والحجب على مستوى الواجهة فقط.
 */
export function SubscriptionGate({ children, onLogout, onRenew }: SubscriptionGateProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CompanySubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      const { data, error } = await supabase.rpc("get_company_subscription_status");
      if (isMounted) {
        if (!error && data && data.length > 0) {
          setStatus(data[0] as CompanySubscriptionStatus);
        }
        setIsLoading(false);
      }
    }

    void loadStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        {t("common.loading")}
      </div>
    );
  }

  const isBlocked =
    status?.status === "trial_expired" ||
    status?.status === "suspended" ||
    status?.status === "cancelled";

  // ---------------------------------------------------------------------
  // الحجب
  // ---------------------------------------------------------------------
  if (isBlocked) {
    const isSuspended = status?.status === "suspended";
    const isCancelled = status?.status === "cancelled";

    const Icon = isSuspended || isCancelled ? Ban : AlertTriangle;
    const iconBg = isSuspended || isCancelled ? "bg-red-500" : "bg-amber-500";
    const titleKey = isSuspended
      ? "subscription.suspendedTitle"
      : isCancelled
        ? "subscription.cancelledTitle"
        : "subscription.expiredTitle";
    const bodyKey = isSuspended
      ? "subscription.suspendedBody"
      : isCancelled
        ? "subscription.cancelledBody"
        : "subscription.expiredBody";

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mb-3 flex justify-center">
            <LanguageSwitcher variant="full" />
          </div>
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl ${iconBg} text-white`}>
            <Icon size={26} />
          </div>
          <h1 className="mb-2 text-xl font-bold text-slate-800">{t(titleKey)}</h1>
          <p className="mb-6 text-sm text-slate-500">{t(bodyKey)}</p>
          <p className="mb-6 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
            {t("subscription.dataSafeNotice")}
          </p>

          {onRenew && !isSuspended && !isCancelled && (
            <button
              onClick={onRenew}
              className="mb-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              {t("subscription.renewButton")}
            </button>
          )}

          <button
            onClick={onLogout}
            className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white"
          >
            {t("common.logout")}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // عرض المحتوى + شارة Trial (إن كان في فترة تجريبية)
  // ---------------------------------------------------------------------
  const isTrial = status?.status === "trial_active";
  const daysRemaining = status?.days_remaining ?? 0;
  const showTrialBanner = isTrial && daysRemaining > 0;

  return (
    <>
      {showTrialBanner && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 border-b border-amber-200">
          <Clock size={12} />
          <span className="font-semibold">
            {t("subscription.trialBanner", { days: daysRemaining })}
          </span>
          {onRenew && (
            <button
              onClick={onRenew}
              className="ms-2 inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-amber-700"
            >
              <RotateCcw size={10} />
              {t("subscription.subscribeNow")}
            </button>
          )}
        </div>
      )}
      {children}
    </>
  );
}