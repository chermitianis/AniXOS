import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { LanguageSwitcher } from "../shared/components/LanguageSwitcher";
import type { CompanySubscriptionStatus } from "../shared/types/database";

interface SubscriptionGateProps {
  children: ReactNode;
  onLogout: () => void;
}

/**
 * بوابة الاشتراك: تُغلِّف كامل التطبيق (إداري وكشك) بعد تحديد الشركة.
 * تحجب الوصول فقط عند انتهاء الفترة التجريبية/الاشتراك — البيانات نفسها
 * تبقى محفوظة بالكامل في قاعدة البيانات دون أي حذف أو تعديل، والحجب على
 * مستوى الواجهة فقط. حساب المطور (is_developer_account) يتجاوز هذا تماماً.
 */
export function SubscriptionGate({ children, onLogout }: SubscriptionGateProps) {
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

  const isBlocked = status?.status === "trial_expired" || status?.status === "suspended" || status?.status === "cancelled";

  if (isBlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mb-3 flex justify-center">
            <LanguageSwitcher variant="full" />
          </div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500 text-2xl text-white">
            ⏳
          </div>
          <h1 className="mb-2 text-xl font-bold text-slate-800">{t("subscription.expiredTitle")}</h1>
          <p className="mb-6 text-sm text-slate-500">{t("subscription.expiredBody")}</p>
          <p className="mb-6 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
            {t("subscription.dataSafeNotice")}
          </p>
          <button onClick={onLogout} className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white">
            {t("common.logout")}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
