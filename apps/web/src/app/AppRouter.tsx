// ============================================================================
// AppRouter: يُطبِّق سيناريو "أول فتحة" بالكامل كما اتُّفق عليه:
//
//   1) لا يوجد device_mode محلي بعد:
//        - لا يوجد موظف مسجّل دخول → CreateCompanyPage أو StaffLoginPage
//        - يوجد موظف مسجّل دخول لكن الجهاز لم يُحدَّد بعد → DeviceRoleSelectionPage
//   2) device_mode = 'kiosk' → KioskRouter مباشرة (بلا أي شاشة إدارية إطلاقاً)
//   3) device_mode = 'admin' → شاشة دخول موظف عادية ثم مساحة العمل الإدارية
//
// كلا المسارين (2) و(3) يمران عبر SubscriptionGate أولاً — يحجب الوصول فقط
// عند انتهاء الفترة التجريبية/الاشتراك (البيانات تبقى محفوظة كاملة).
// ============================================================================

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StaffAuthProvider, useStaffAuth } from "../auth/StaffAuthContext";
import { getLocalDeviceMode } from "../lib/deviceContext";
import { CreateCompanyPage } from "../modules/setup/pages/CreateCompanyPage";
import { StaffLoginPage } from "../modules/setup/pages/StaffLoginPage";
import { DeviceRoleSelectionPage } from "../modules/setup/pages/DeviceRoleSelectionPage";
import { KioskRouter } from "../modules/kiosk/pages/KioskRouter";
import { WorkerSessionProvider } from "../auth/WorkerSessionContext";
import { AdminHomePage } from "../modules/setup/pages/AdminHomePage";
import { SubscriptionGate } from "./SubscriptionGate";

export function AppRouter() {
  // القرار الأول والأهم: هل هذا الجهاز Kiosk أصلاً؟ إن كان كذلك، لا داعي
  // لتحميل أي من منطق المصادقة الإدارية (StaffAuthProvider) إطلاقاً —
  // الكشك يعتمد فقط على جلسة الجهاز الدائمة + جلسة العامل المنطقية.
  const deviceMode = getLocalDeviceMode();

  if (deviceMode === "kiosk") {
    return (
      <SubscriptionGate onLogout={() => window.location.reload()}>
        <WorkerSessionProvider>
          <KioskRouter />
        </WorkerSessionProvider>
      </SubscriptionGate>
    );
  }

  // بقية الحالات (جهاز إداري، أو جهاز لم يُحدَّد دوره بعد) تحتاج طبقة
  // المصادقة الإدارية لأنها جميعاً تمر عبر تسجيل دخول موظف أولاً
  return (
    <StaffAuthProvider>
      <StaffFlowRouter />
    </StaffAuthProvider>
  );
}

function StaffFlowRouter() {
  const { t } = useTranslation();
  const { session, isLoading, signOut } = useStaffAuth();
  const [authView, setAuthView] = useState<"login" | "create">("login");
  // إعادة عرض بعد تسجيل جهاز إداري بنجاح (لا يحتاج تبديل جلسة، فقط إعادة قراءة الحالة)
  const [, forceRerender] = useState(0);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        {t("common.loading")}
      </div>
    );
  }

  if (!session) {
    return authView === "create" ? (
      <CreateCompanyPage onCreated={() => forceRerender((n) => n + 1)} onSwitchToLogin={() => setAuthView("login")} />
    ) : (
      <StaffLoginPage onSwitchToCreateCompany={() => setAuthView("create")} />
    );
  }

  const deviceMode = getLocalDeviceMode();

  if (!deviceMode) {
    return <DeviceRoleSelectionPage onRegistered={() => forceRerender((n) => n + 1)} />;
  }

  // deviceMode === "admin" من هنا فصاعداً (حالة "kiosk" عولجت في AppRouter
  // نفسه قبل الوصول لهذا المكوّن أصلاً)
  return (
    <SubscriptionGate onLogout={() => void signOut()}>
      <AdminHomePage />
    </SubscriptionGate>
  );
}
