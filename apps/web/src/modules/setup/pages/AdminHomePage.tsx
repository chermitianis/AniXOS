import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu, X, Terminal } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { hasPermission } from "../../../auth/permissions";
import { AppLogo } from "../../../shared/components/AppLogo";
import { ReclamationsBell } from "../components/ReclamationsBell";
import { connectivityMonitor } from "../../../lib/connectivity";
import { NAV_TREE, type NavGroup, type NavNode } from "../../../app/navTree";
import { NavItem } from "../../../app/NavItem";
import { NavContext } from "../../../app/NavContext";
import { ComingSoonPage } from "./ComingSoonPage";

import { ManagerDashboardPage } from "./ManagerDashboardPage";
import { PlanningAdminPage } from "./PlanningAdminPage";
import { ProjectsAdminPage } from "./ProjectsAdminPage";
import { ManufacturingOrdersAdminPage } from "./ManufacturingOrdersAdminPage";
import { SalesAdminPage } from "./SalesAdminPage";
import { InventoryAdminPage } from "./InventoryAdminPage";
import { ClientsAdminPage } from "./ClientsAdminPage";
import { WorkersAdminPage } from "./WorkersAdminPage";
import { MachinesAdminPage } from "./MachinesAdminPage";
import { OperationsAdminPage } from "./OperationsAdminPage";
import { ArchivePage } from "./ArchivePage";
import { NomenclaturePage } from "../../nomenclature/pages/NomenclaturePage";
import { ReportsPage } from "../../reports/pages/ReportsPage";
import { CRMAdminPage } from "../../crm/pages/CRMAdminPage";
import { AccountingAdminPage } from "../../accounting/pages/AccountingAdminPage";
import { DossiersTechniquesPage } from "../../engineering/pages/DossiersTechniquesPage";
import { GammesTempsPage } from "../../engineering/pages/GammesTempsPage";
import { ValidationTechniquePage } from "../../engineering/pages/ValidationTechniquePage";
import { ProductionDashboardPage } from "./ProductionDashboardPage";
import { ProductionPreparationPage } from "./ProductionPreparationPage";
import { ThemeProvider } from "../../../app/ThemeContext";
import { TopRightActions } from "../../../app/TopRightActions";
import { MyProfilePage } from "../../settings/pages/MyProfilePage";
import { StaffAdminPage } from "../../settings/pages/StaffAdminPage";
import { RolesAdminPage } from "../../settings/pages/RolesAdminPage";
import { DatabasePage } from "../../settings/pages/DatabasePage";
import { PlanningQrSecurityCard } from "../../settings/components/PlanningQrSecurityCard";
import { OdooIntegrationPanel } from "../../settings/components/OdooIntegrationPanel";
import { DatabasesManagerPage } from "./DatabasesManagerPage";
import { SubscriptionPage } from "../../subscription/pages/SubscriptionPage";
import { ChangePasswordModal } from "../../../app/ChangePasswordModal";
import { GeneralSettingsPage } from "../../../app/GeneralSettingsPage";

// ---------------------------------------------------------------------------
// Pages mapping
// ---------------------------------------------------------------------------
const PAGES: Record<string, React.ComponentType> = {
  dashboard: ManagerDashboardPage,
  reports: ReportsPage,

  // CRM
  crm: CRMAdminPage,
  clients: ClientsAdminPage,

  // Ingénierie
  nomenclature: NomenclaturePage,
  projects: ProjectsAdminPage,
  engineering_dossiers: DossiersTechniquesPage,
  engineering_gammes: GammesTempsPage,
  engineering_validation: ValidationTechniquePage,

  // Production
  production_dashboard: ProductionDashboardPage,
  production_preparation: ProductionPreparationPage,
  manufacturing_orders: ManufacturingOrdersAdminPage,
  planning: PlanningAdminPage,

  // Finance / Commerce
  accounting: AccountingAdminPage,
  quotes: SalesAdminPage,
  sales: SalesAdminPage,
  invoices: SalesAdminPage,
  inventory: InventoryAdminPage,
  purchases: InventoryAdminPage,

  // Ressources
  workers: WorkersAdminPage,
  machines: MachinesAdminPage,
  operations: OperationsAdminPage,

  // Archive
  archive: ArchivePage,

  // Administration
  admin_staff: StaffAdminPage,
  admin_roles: RolesAdminPage,
  admin_general_settings: GeneralSettingsPage,
  admin_database: DatabasePage,
  admin_databases: DatabasesManagerPage,
  admin_subscription: SubscriptionPage,
  admin_security_qr: PlanningQrSecurityCard,
  admin_odoo: OdooIntegrationPanel,
};

const SIDEBAR_COLLAPSED_KEY = "anixos_sidebar_collapsed";
const NAV_EXPANDED_KEY = "anixos_nav_expanded";

interface AdminHomePageProps {
  onNavigateToSubscription?: () => void;
  onNavigateToDeveloperPanel?: () => void;
  onNavigateToDatabasesManager?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function filterTree(groups: NavGroup[], role: any, isOwner: boolean): NavGroup[] {
  function filterNode(node: NavNode): NavNode | null {
    if (node.permissionKey && !isOwner && !hasPermission(role, node.permissionKey, "view")) {
      return null;
    }
    if (node.children) {
      const filtered = node.children
        .map(filterNode)
        .filter((n): n is NavNode => n !== null);
      if (filtered.length === 0 && !node.pageKey) return null;
      return { ...node, children: filtered };
    }
    return node;
  }
  return groups
    .map((g) => ({
      ...g,
      items: g.items.map(filterNode).filter((n): n is NavNode => n !== null),
    }))
    .filter((g) => g.items.length > 0);
}

function findNode(groups: NavGroup[], key: string): NavNode | null {
  function walk(nodes: NavNode[]): NavNode | null {
    for (const n of nodes) {
      if (n.key === key) return n;
      if (n.children) {
        const found = walk(n.children);
        if (found) return found;
      }
    }
    return null;
  }
  for (const g of groups) {
    const found = walk(g.items);
    if (found) return found;
  }
  return null;
}

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_EXPANDED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set([
    "vue_ensemble",
    "commercial",
    "ingenierie",
    "production",
    "finance",
    "atelier",
    "archives",
    "administration",
  ]);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AdminHomePage({
  onNavigateToSubscription,
  onNavigateToDeveloperPanel,
  onNavigateToDatabasesManager,
}: AdminHomePageProps) {
  const { t } = useTranslation();
  const { staffUser, role } = useStaffAuth();
  const [isOnline, setIsOnline] = useState(() => connectivityMonitor.getStatus());
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(loadExpanded);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [navParams, setNavParams] = useState<Record<string, string> | null>(null);

  const mainScrollRef = useRef<HTMLElement>(null);

  const navValue = useMemo(
    () => ({
      goToSection: (key: string, params?: Record<string, string>) => {
        setActiveSection(key);
        setNavParams(params ?? null);
        setShowProfile(false);
      },
      consumeParams: () => {
        const p = navParams;
        setNavParams(null);
        return p;
      },
    }),
    [navParams],
  );

  useEffect(() => connectivityMonitor.subscribe(setIsOnline), []);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const { data } = await supabase.rpc("is_developer");
      if (isMounted) setIsDeveloper(data === true);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [isCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_EXPANDED_KEY, JSON.stringify(Array.from(expandedKeys)));
    } catch {
      /* ignore */
    }
  }, [expandedKeys]);

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection, showProfile]);

  useEffect(() => {
    document.body.style.overflow = isSidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  const isOwner = staffUser?.is_owner ?? false;
  const visibleGroups = filterTree(NAV_TREE, role, isOwner);

  function firstLeafKey(groups: NavGroup[]): string | null {
    function walk(nodes: NavNode[]): string | null {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          const found = walk(n.children);
          if (found) return found;
        } else if (n.pageKey) {
          return n.key;
        }
      }
      return null;
    }
    for (const g of groups) {
      const found = walk(g.items);
      if (found) return found;
    }
    return null;
  }

  const fallbackKey = firstLeafKey(visibleGroups);
  const currentKey = activeSection ?? fallbackKey;
  const currentNode = currentKey ? findNode(visibleGroups, currentKey) : null;

  const currentLabel = currentNode
    ? t(currentNode.labelKey, { defaultValue: currentNode.label })
    : "";

  const CurrentIcon = currentNode?.icon;

  function handleSelect(key: string) {
    setActiveSection(key);
    setNavParams(null);
    setIsSidebarOpen(false);
    setShowProfile(false);
  }

  function handleToggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleToggleGroup(key: string) {
    handleToggleExpand(key);
  }

  return (
    <ThemeProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-slate-50 md:flex-row">
        {/* MOBILE HEADER */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5 md:hidden">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200"
            aria-label={t("common.menu")}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <AppLogo size="sm" />
            <span className="text-sm font-extrabold tracking-tight text-slate-800">AniXOS</span>
          </div>
          <ReclamationsBell />
        </header>

        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* SIDEBAR */}
        <aside
          className={`
            fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-slate-200 bg-white
            transition-transform duration-300 ease-in-out
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}
            md:static md:z-auto md:translate-x-0
            ${isCollapsed ? "md:w-16" : "md:w-64"}
          `}
        >
          <div className={`flex-shrink-0 border-b border-slate-100 ${isCollapsed ? "md:p-2 p-4" : "p-4"}`}>
            <div className={`flex items-center ${isCollapsed ? "md:flex-col md:gap-2 mb-0" : "mb-2 gap-2.5"}`}>
              <AppLogo size="sm" />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-base font-extrabold tracking-tight text-slate-800">AniXOS</span>
                  <div className="hidden md:block">
                    <ReclamationsBell />
                  </div>
                </>
              )}
              {isCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed(false)}
                  className="hidden md:flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  title={t("common.expandMenu")}
                  aria-label={t("common.expandMenu")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </div>

            {!isCollapsed && (
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="hidden md:flex absolute end-2 top-4 rounded-lg p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                title={t("common.collapseMenu")}
                aria-label={t("common.collapseMenu")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}

            {!isCollapsed && (
              <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                <p className="truncate text-sm font-semibold text-slate-700">{staffUser?.full_name}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-slate-400">{role?.name}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                    <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`} />
                    {isOnline ? t("kiosk.online") : t("kiosk.offline")}
                  </span>
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3">
            {visibleGroups.map((group) => {
              const isGroupExpanded = expandedKeys.has(group.key);
              const groupLabel = t(group.labelKey, { defaultValue: group.label });
              return (
                <div key={group.key} className="mb-3">
                  {!isCollapsed ? (
                    <button
                      type="button"
                      onClick={() => handleToggleGroup(group.key)}
                      className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
                    >
                      <span className="truncate">{groupLabel}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 transition-transform ${isGroupExpanded ? "rotate-90" : ""}`}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  ) : (
                    <div className="my-1 h-px bg-slate-100" />
                  )}

                  {(isCollapsed || isGroupExpanded) &&
                    group.items.map((item) => (
                      <NavItem
                        key={item.key}
                        node={item}
                        depth={0}
                        activeKey={currentKey}
                        expandedKeys={expandedKeys}
                        onSelect={handleSelect}
                        onToggleExpand={handleToggleExpand}
                      />
                    ))}
                </div>
              );
            })}
          </nav>

          <div className={`flex-shrink-0 border-t border-slate-100 p-2 ${isCollapsed ? "md:px-1" : ""}`}>
            {onNavigateToDeveloperPanel && isDeveloper && (
              <button
                onClick={onNavigateToDeveloperPanel}
                className={`flex w-full items-center rounded-lg text-start text-sm font-semibold text-slate-900 hover:bg-slate-100 ${
                  isCollapsed ? "md:justify-center gap-2.5 px-3 py-2" : "gap-2.5 px-3 py-2"
                }`}
                title={isCollapsed ? t("developer.navLabel") : undefined}
              >
                <Terminal size={17} className="shrink-0" />
                {!isCollapsed && <span className="flex-1 truncate">{t("developer.navLabel")}</span>}
              </button>
            )}
          </div>
        </aside>

        {/* TOP RIGHT ACTIONS */}
        <TopRightActions onOpenProfile={() => setShowProfile(true)} />

        {/* MAIN */}
        <main ref={mainScrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <NavContext.Provider value={navValue}>
            {!showProfile && currentNode && (
              <div className="mb-4 flex items-center gap-2.5 md:mb-6">
                {CurrentIcon && <CurrentIcon size={20} className="shrink-0 text-indigo-600 md:size-[22px]" />}
                <h1 className="min-w-0 flex-1 truncate text-base font-extrabold tracking-tight text-slate-800 md:text-xl">
                  {currentLabel}
                </h1>
              </div>
            )}

            {currentKey === "admin_change_password" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                <p className="mb-4 text-sm text-slate-500">
                  {t("myProfile.changePasswordTitle")}
                </p>
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  {t("myProfile.changePasswordButton")}
                </button>
              </div>
            ) : showProfile ? (
              <MyProfilePage
                onNavigateToSubscription={onNavigateToSubscription}
                onNavigateToDatabasesManager={onNavigateToDatabasesManager}
              />
            ) : currentNode?.pageKey && PAGES[currentNode.pageKey] ? (
              (() => {
                const Comp = PAGES[currentNode.pageKey];
                return <Comp />;
              })()
            ) : currentKey ? (
              <ComingSoonPage title={currentLabel} />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
                {t("setup.noDataYet")}
              </div>
            )}
          </NavContext.Provider>
        </main>

        {showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        )}
      </div>
    </ThemeProvider>
  );
}