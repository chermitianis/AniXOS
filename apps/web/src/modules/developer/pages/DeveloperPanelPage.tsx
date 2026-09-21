import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, LayoutDashboard, Users, DollarSign, BarChart3, Activity,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";
import { AppLogo } from "../../../shared/components/AppLogo";
import { PricingTab } from "../components/PricingTab";
import { AccountsTab } from "../components/AccountsTab";
import { OverviewTab } from "../components/OverviewTab";
import { AnalyticsTab } from "../components/AnalyticsTab";
import { EventsTab } from "../components/EventsTab";

type DeveloperTab = "overview" | "accounts" | "pricing" | "analytics" | "events";

interface DeveloperPanelPageProps {
  onBack: () => void;
}

export function DeveloperPanelPage({ onBack }: DeveloperPanelPageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DeveloperTab>("pricing");
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  // Compteur de rafraîchissement : incrémenté après chaque action de gestion
  // pour forcer le rechargement des onglets de lecture (accounts / events).
  const [refreshKey, setRefreshKey] = useState(0);

  // Vérification d'accès : seul le développeur peut entrer
  useEffect(() => {
    let isMounted = true;
    async function checkAccess() {
      const { data, error } = await supabase.rpc("is_developer");
      if (isMounted) {
        setIsAuthorized(!error && data === true);
      }
    }
    void checkAccess();
    return () => {
      isMounted = false;
    };
  }, []);

  /** Callback appelé après toute action de gestion réussie.
   *  Force un rafraîchissement global des onglets de lecture. */
  const handleDataChanged = useCallback(() => {
    setRefreshKey((n) => n + 1);
  }, []);

  // ============= Chargement initial =============
  if (isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  // ============= Accès refusé =============
  if (isAuthorized === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-red-100 text-2xl text-red-600">
            🔒
          </div>
          <h1 className="mb-2 text-xl font-bold text-slate-800">{t("developer.accessDenied")}</h1>
          <p className="mb-6 text-sm text-slate-500">{t("developer.accessDeniedBody")}</p>
          <button
            onClick={onBack}
            className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
          >
            {t("common.back")}
          </button>
        </div>
      </div>
    );
  }

  // ============= Définition des onglets =============
  const tabs: { key: DeveloperTab; labelKey: string; icon: typeof LayoutDashboard }[] = [
    { key: "overview", labelKey: "developer.tabs.overview", icon: LayoutDashboard },
    { key: "accounts", labelKey: "developer.tabs.accounts", icon: Users },
    { key: "pricing", labelKey: "developer.tabs.pricing", icon: DollarSign },
    { key: "analytics", labelKey: "developer.tabs.analytics", icon: BarChart3 },
    { key: "events", labelKey: "developer.tabs.events", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ========== Header ========== */}
      <header className="border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft size={16} />
            {t("developer.backToApp")}
          </button>

          <div className="flex items-center gap-2">
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
              Developer
            </span>
            <AppLogo size="sm" />
            <span className="text-sm font-extrabold tracking-tight">AniXOS</span>
          </div>

          <div className="[&_button]:!text-slate-300 [&_button:hover]:!text-white">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* ========== Onglets ========== */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex shrink-0 items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-b-2 border-slate-900 text-slate-900"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Icon size={15} />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========== Contenu ========== */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {activeTab === "overview" && <OverviewTab key={`ov-${refreshKey}`} />}
        {activeTab === "accounts" && (
          <AccountsTab key={`acc-${refreshKey}`} onChanged={handleDataChanged} />
        )}
        {activeTab === "pricing" && <PricingTab />}
        {activeTab === "analytics" && <AnalyticsTab key={`an-${refreshKey}`} />}
        {activeTab === "events" && <EventsTab key={`ev-${refreshKey}`} />}
      </main>
    </div>
  );
}