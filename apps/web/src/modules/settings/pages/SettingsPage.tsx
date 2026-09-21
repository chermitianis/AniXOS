import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Users2, Shield, Smartphone, Link2, Database as DatabaseIcon, UserCircle2, ShieldCheck,
} from "lucide-react";
import { SettingsGate } from "../components/SettingsGate";
import { DeviceSettingsPage } from "./DeviceSettingsPage";
import { RolesAdminPage } from "./RolesAdminPage";
import { StaffAdminPage } from "./StaffAdminPage";
import { DatabasePage } from "./DatabasePage";
import { OdooIntegrationPanel } from "../components/OdooIntegrationPanel";
import { MyProfilePage } from "./MyProfilePage";
import { PlanningQrSecurityCard } from "../components/PlanningQrSecurityCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SettingsTab =
  | "profile"
  | "staff"
  | "roles"
  | "security"
  | "device"
  | "integrations"
  | "database";

type TabGroup = "account" | "organization" | "integrations" | "advanced";

interface TabDef {
  key: SettingsTab;
  labelKey: string;
  icon: typeof Users2;
  group: TabGroup;
}

interface SettingsPageProps {
  onNavigateToSubscription?: () => void;
  onNavigateToDatabasesManager?: () => void;
}

// ---------------------------------------------------------------------------
// Définition des onglets
// ---------------------------------------------------------------------------
const TABS: TabDef[] = [
  // Mon compte
  { key: "profile", labelKey: "nav.myProfile", icon: UserCircle2, group: "account" },
  // Organisation
  { key: "staff", labelKey: "nav.staff", icon: Users2, group: "organization" },
  { key: "roles", labelKey: "nav.roles", icon: Shield, group: "organization" },
  { key: "security", labelKey: "nav.security", icon: ShieldCheck, group: "organization" },
  { key: "device", labelKey: "nav.device", icon: Smartphone, group: "organization" },
  // Intégrations
  { key: "integrations", labelKey: "settings.integrations", icon: Link2, group: "integrations" },
  // Avancé
  { key: "database", labelKey: "database.tab", icon: DatabaseIcon, group: "advanced" },
];

const GROUP_LABELS: Record<TabGroup, string> = {
  account: "settings.groupAccount",
  organization: "settings.groupOrganization",
  integrations: "settings.groupIntegrations",
  advanced: "settings.groupAdvanced",
};

const GROUP_ORDER: TabGroup[] = ["account", "organization", "integrations", "advanced"];

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------
export function SettingsPage({
  onNavigateToSubscription,
  onNavigateToDatabasesManager,
}: SettingsPageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const grouped = TABS.reduce<Record<TabGroup, TabDef[]>>(
    (acc, tab) => {
      acc[tab.group].push(tab);
      return acc;
    },
    { account: [], organization: [], integrations: [], advanced: [] },
  );

  return (
    <SettingsGate>
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Navigation latérale */}
        <aside className="w-full shrink-0 lg:w-56">
          <div className="lg:sticky lg:top-4">
            {/* Version mobile : tabs horizontaux scrollables */}
            <nav className="flex gap-1 overflow-x-auto pb-2 lg:hidden">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={isActive ? "text-indigo-600" : "text-slate-400"}
                    />
                    <span>{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </nav>

            {/* Version desktop : groupes verticaux */}
            <nav className="hidden lg:flex lg:flex-col">
              {GROUP_ORDER.map((group) => {
                const items = grouped[group];
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mb-4">
                    <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {t(GROUP_LABELS[group])}
                    </p>
                    {items.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          className={`group mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-semibold transition-all ${
                            isActive
                              ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                        >
                          <Icon
                            size={17}
                            className={
                              isActive
                                ? "text-indigo-600"
                                : "text-slate-400 group-hover:text-slate-600"
                            }
                          />
                          <span className="flex-1">{t(tab.labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Contenu */}
        <div className="min-w-0 flex-1">
          {activeTab === "profile" && (
            <MyProfilePage
              onNavigateToSubscription={onNavigateToSubscription}
              onNavigateToDatabasesManager={onNavigateToDatabasesManager}
            />
          )}
          {activeTab === "staff" && <StaffAdminPage />}
          {activeTab === "roles" && <RolesAdminPage />}
          {activeTab === "security" && <PlanningQrSecurityCard />}
          {activeTab === "device" && <DeviceSettingsPage />}
          {activeTab === "integrations" && <OdooIntegrationPanel />}
          {activeTab === "database" && <DatabasePage />}
        </div>
      </div>
    </SettingsGate>
  );
}