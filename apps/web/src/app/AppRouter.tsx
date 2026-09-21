import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { StaffAuthProvider, useStaffAuth } from "../auth/StaffAuthContext";
import { getLocalDeviceMode } from "../lib/deviceContext";
import { getActiveCompanyIdSync } from "../lib/activeCompany";
import { CreateAccountPage } from "../modules/setup/pages/CreateAccountPage";
import { StaffLoginPage } from "../modules/setup/pages/StaffLoginPage";
import { DeviceRoleSelectionPage } from "../modules/setup/pages/DeviceRoleSelectionPage";
import { DatabaseSelectorPage } from "../modules/setup/pages/DatabaseSelectorPage";
import { DatabasesManagerPage } from "../modules/setup/pages/DatabasesManagerPage";
import { KioskRouter } from "../modules/kiosk/pages/KioskRouter";
import { WorkerSessionProvider } from "../auth/WorkerSessionContext";
import { AdminHomePage } from "../modules/setup/pages/AdminHomePage";
import { SubscriptionPage } from "../modules/subscription/pages/SubscriptionPage";
import { DeveloperPanelPage } from "../modules/developer/pages/DeveloperPanelPage";
import { SubscriptionGate } from "./SubscriptionGate";

export function AppRouter() {
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
  const [, forceRerender] = useState(0);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showDeveloperPanel, setShowDeveloperPanel] = useState(false);
  const [showDatabasesManager, setShowDatabasesManager] = useState(false);

  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() => getActiveCompanyIdSync());

  const refreshActiveCompany = useCallback(() => {
    setActiveCompanyId(getActiveCompanyIdSync());
    forceRerender((n) => n + 1);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        {t("common.loading")}
      </div>
    );
  }

  if (!session) {
    return authView === "create" ? (
      <CreateAccountPage
        onCreated={() => forceRerender((n) => n + 1)}
        onSwitchToLogin={() => setAuthView("login")}
      />
    ) : (
      <StaffLoginPage onSwitchToCreateCompany={() => setAuthView("create")} />
    );
  }

  const deviceMode = getLocalDeviceMode();

  if (!deviceMode) {
    return <DeviceRoleSelectionPage onRegistered={() => forceRerender((n) => n + 1)} />;
  }

  if (!activeCompanyId) {
    return (
      <DatabaseSelectorPage
        onSelected={refreshActiveCompany}
        onLogout={() => void signOut()}
      />
    );
  }

  // Panneau développeur (state-based, avant SubscriptionGate car il n'y est pas soumis)
  if (showDeveloperPanel) {
    return <DeveloperPanelPage onBack={() => setShowDeveloperPanel(false)} />;
  }

  // Page d'abonnement dédiée
  if (showSubscription) {
    return <SubscriptionPage onBack={() => setShowSubscription(false)} />;
  }

  // Page de gestion des bases de données (multi-database)
  if (showDatabasesManager) {
    return <DatabasesManagerPage onBack={() => setShowDatabasesManager(false)} />;
  }

  return (
    <SubscriptionGate
      onLogout={() => void signOut()}
      onRenew={() => setShowSubscription(true)}
    >
      <AdminHomePage
        onNavigateToSubscription={() => setShowSubscription(true)}
        onNavigateToDeveloperPanel={() => setShowDeveloperPanel(true)}
        onNavigateToDatabasesManager={() => setShowDatabasesManager(true)}
      />
    </SubscriptionGate>
  );
}