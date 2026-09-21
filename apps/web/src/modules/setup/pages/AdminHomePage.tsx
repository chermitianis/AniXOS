import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, FileBarChart, Factory, CalendarClock, FolderKanban,
  ClipboardList, Calculator, ShoppingCart, Package, Users2, HardHat,
  Cog, ListChecks, Archive,
  LogOut, Menu, X, Terminal, type LucideIcon,
  Users, FileText, Truck, UserCircle2, Landmark,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { hasPermission } from "../../../auth/permissions";
import { AppLogo } from "../../../shared/components/AppLogo";
import { ReclamationsBell } from "../components/ReclamationsBell";
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
import { WorkshopInfoPage } from "./WorkshopInfoPage";
import { ArchivePage } from "./ArchivePage";
import { SettingsPage } from "../../settings/pages/SettingsPage";
import { NomenclaturePage } from "../../nomenclature/pages/NomenclaturePage";
import { ReportsPage } from "../../reports/pages/ReportsPage";
import { CRMAdminPage } from "../../crm/pages/CRMAdminPage";
import { AccountingAdminPage } from "../../accounting/pages/AccountingAdminPage";
import { connectivityMonitor } from "../../../lib/connectivity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AdminSection =
  | "dashboard" | "reports" | "workshop"
  | "crm"
  | "nomenclature" | "projects" | "manufacturing_orders" | "planning" | "accounting"
  | "quotes" | "sales" | "invoices" | "inventory" | "purchases" | "clients"
  | "workers" | "machines" | "operations"
  | "archive" | "settings";

interface NavItem {
  key: AdminSection;
  labelKey: string;
  icon: LucideIcon;
}
interface SectionGroup {
  titleKey: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Structure du menu
// ---------------------------------------------------------------------------
const RAW_GROUPS: SectionGroup[] = [
  {
    titleKey: "navGroup.overview",
    items: [
      { key: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { key: "reports",   labelKey: "nav.reports",   icon: FileBarChart },
      { key: "workshop",  labelKey: "nav.workshop",  icon: Factory },
    ],
  },
  {
    titleKey: "navGroup.atelier",
    items: [
      { key: "crm", labelKey: "nav.crm", icon: Users },
    ],
  },
  {
    titleKey: "navGroup.production",
    items: [
      { key: "nomenclature",         labelKey: "nav.etudeProjet",         icon: Calculator },
      { key: "projects",             labelKey: "nav.projects",            icon: FolderKanban },
      { key: "manufacturing_orders", labelKey: "nav.manufacturing_orders",icon: ClipboardList },
      { key: "planning",             labelKey: "nav.planning",            icon: CalendarClock },
      { key: "accounting",           labelKey: "nav.accounting",          icon: Landmark },
    ],
  },
  {
    titleKey: "navGroup.commerce",
    items: [
      { key: "quotes",    labelKey: "nav.quotes",    icon: FileText },
      { key: "sales",     labelKey: "nav.sales",     icon: ShoppingCart },
      { key: "invoices",  labelKey: "nav.invoices",  icon: FileText },
      { key: "inventory", labelKey: "nav.inventory", icon: Package },
      { key: "purchases", labelKey: "nav.purchases", icon: Truck },
      { key: "clients",   labelKey: "nav.clients",   icon: Users2 },
    ],
  },
  {
    titleKey: "navGroup.resources",
    items: [
      { key: "workers",    labelKey: "nav.workers",    icon: HardHat },
      { key: "machines",   labelKey: "nav.machines",   icon: Cog },
      { key: "operations", labelKey: "nav.operations", icon: ListChecks },
    ],
  },
  {
    titleKey: "navGroup.admin",
    items: [
      { key: "archive",  labelKey: "nav.archive",   icon: Archive },
      { key: "settings", labelKey: "nav.myProfile", icon: UserCircle2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mapping section → Composant (sauf 'settings')
// ---------------------------------------------------------------------------
const PAGES: Record<Exclude<AdminSection, "settings">, React.ComponentType> = {
  dashboard: ManagerDashboardPage,
  reports: ReportsPage,
  workshop: WorkshopInfoPage,
  crm: CRMAdminPage,
  nomenclature: NomenclaturePage,
  projects: ProjectsAdminPage,
  manufacturing_orders: ManufacturingOrdersAdminPage,
  planning: PlanningAdminPage,
  accounting: AccountingAdminPage,
  quotes: SalesAdminPage,
  sales: SalesAdminPage,
  invoices: SalesAdminPage,
  inventory: InventoryAdminPage,
  purchases: InventoryAdminPage,
  clients: ClientsAdminPage,
  workers: WorkersAdminPage,
  machines: MachinesAdminPage,
  operations: OperationsAdminPage,
  archive: ArchivePage,
};

const SIDEBAR_COLLAPSED_KEY = "anixos_sidebar_collapsed";

interface AdminHomePageProps {
  onNavigateToSubscription?: () => void;
  onNavigateToDeveloperPanel?: () => void;
  onNavigateToDatabasesManager?: () => void;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------
export function AdminHomePage({
  onNavigateToSubscription,
  onNavigateToDeveloperPanel,
  onNavigateToDatabasesManager,
}: AdminHomePageProps) {
  const { t } = useTranslation();
  const { staffUser, role, signOut } = useStaffAuth();
  const [isOnline, setIsOnline] = useState(() => connectivityMonitor.getStatus());
  const [isDeveloper, setIsDeveloper] = useState(false);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const mainScrollRef = useRef<HTMLElement>(null);

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

  const visibleGroups = RAW_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => staffUser?.is_owner || hasPermission(role, item.key, "view"),
    ),
  })).filter((group) => group.items.length > 0);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  const [activeSection, setActiveSection] = useState<AdminSection | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const currentSection =
    activeSection && allVisibleItems.some((i) => i.key === activeSection)
      ? activeSection
      : (allVisibleItems[0]?.key ?? null);

  // Reset scroll du contenu à chaque changement de section
  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [currentSection]);

  // Bloquer le scroll du body quand le drawer mobile est ouvert
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  function handleItemDoubleClick() {
    setIsCollapsed((v) => !v);
  }
  function handleToggleCollapse() {
    setIsCollapsed((v) => !v);
  }
  function handleSelectSection(key: AdminSection) {
    setActiveSection(key);
    setIsSidebarOpen(false);
  }

  const ActivePage =
    currentSection && currentSection !== "settings"
      ? PAGES[currentSection]
      : null;
  const currentItem = allVisibleItems.find((i) => i.key === currentSection);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 md:flex-row">
      {/* ============================================================= */}
      {/* MOBILE : barre supérieure (visible uniquement < md)            */}
      {/* ============================================================= */}
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
          <span className="text-sm font-extrabold tracking-tight text-slate-800">
            AniXOS
          </span>
        </div>
        <ReclamationsBell />
      </header>

      {/* ============================================================= */}
      {/* MOBILE : overlay sombre quand le drawer est ouvert             */}
      {/* ============================================================= */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ============================================================= */}
      {/* SIDEBAR (drawer sur mobile, colonne fixe sur desktop)          */}
      {/* ============================================================= */}
      <aside
        className={`
          fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-slate-200 bg-white
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}
          md:static md:z-auto md:translate-x-0
          ${isCollapsed ? "md:w-16" : "md:w-64"}
        `}
      >
        {/* Header du sidebar */}
        <div className={`flex-shrink-0 border-b border-slate-100 transition-all ${isCollapsed ? "md:p-2 p-4" : "p-4"}`}>
          <div className={`flex items-center ${isCollapsed ? "md:flex-col md:gap-2 md:mb-0 mb-2 gap-2.5" : "mb-2 gap-2.5"}`}>
            <AppLogo size="sm" />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-base font-extrabold tracking-tight text-slate-800">
                  AniXOS
                </span>
                <div className="hidden md:block">
                  <ReclamationsBell />
                </div>
              </>
            )}
            {isCollapsed && (
              <button
                type="button"
                onClick={handleToggleCollapse}
                className="hidden md:flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title={t("common.expandMenu")}
                aria-label={t("common.expandMenu")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
            {/* Bouton fermer (mobile uniquement) */}
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
              onClick={handleToggleCollapse}
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
              <p className="truncate text-sm font-semibold text-slate-700">
                {staffUser?.full_name}
              </p>
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

        <nav className={`flex-1 overflow-y-auto p-2 ${isCollapsed ? "md:px-1" : ""}`}>
          {visibleGroups.map((group) => (
            <div key={group.titleKey} className={isCollapsed ? "mb-2" : "mb-4"}>
              {!isCollapsed && (
                <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t(group.titleKey)}
                </p>
              )}
              {isCollapsed && <div className="my-1 h-px bg-slate-100" />}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentSection === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleSelectSection(item.key)}
                    onDoubleClick={handleItemDoubleClick}
                    className={`group relative mb-0.5 flex items-center rounded-lg transition-all ${
                      isCollapsed
                        ? "md:justify-center md:px-0 md:py-2.5 w-full px-3 py-2 gap-2.5"
                        : "w-full gap-2.5 px-3 py-2"
                    } text-start text-sm font-semibold ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                    title={isCollapsed ? t(item.labelKey) : undefined}
                  >
                    <Icon
                      size={17}
                      className={`shrink-0 ${isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"}`}
                    />
                    {!isCollapsed && <span className="flex-1 truncate">{t(item.labelKey)}</span>}

                    {isCollapsed && (
                      <span
                        className="pointer-events-none absolute start-full ms-2 z-50 hidden rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block whitespace-nowrap"
                        role="tooltip"
                      >
                        {t(item.labelKey)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={`flex-shrink-0 border-t border-slate-100 p-2 ${isCollapsed ? "md:px-1" : ""}`}>
          {onNavigateToDeveloperPanel && isDeveloper && (
            <button
              onClick={onNavigateToDeveloperPanel}
              className={`mb-1 flex w-full items-center rounded-lg text-start text-sm font-semibold text-slate-900 hover:bg-slate-100 ${
                isCollapsed ? "md:justify-center md:px-0 md:py-2.5 gap-2.5 px-3 py-2" : "gap-2.5 px-3 py-2"
              }`}
              title={isCollapsed ? t("developer.navLabel") : undefined}
            >
              <Terminal size={17} className="shrink-0" />
              {!isCollapsed && <span className="flex-1 truncate">{t("developer.navLabel")}</span>}
            </button>
          )}

          <button
            onClick={() => void signOut()}
            className={`flex w-full items-center rounded-lg text-start text-sm font-semibold text-red-500 hover:bg-red-50 ${
              isCollapsed ? "md:justify-center md:px-0 md:py-2.5 gap-2.5 px-3 py-2" : "gap-2.5 px-3 py-2"
            }`}
            title={isCollapsed ? t("common.logout") : undefined}
          >
            <LogOut size={17} className="shrink-0" />
            {!isCollapsed && <span className="flex-1 truncate">{t("common.logout")}</span>}
          </button>
        </div>
      </aside>

      {/* ============================================================= */}
      {/* MAIN : prend 100% de l'espace restant                         */}
      {/* ============================================================= */}
      <main
        ref={mainScrollRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6"
      >
        {currentItem && (
          <div className="mb-4 flex items-center gap-2.5 md:mb-6">
            <currentItem.icon size={20} className="shrink-0 text-indigo-600 md:size-[22px]" />
            <h1 className="min-w-0 flex-1 truncate text-base font-extrabold tracking-tight text-slate-800 md:text-xl">
              {t(currentItem.labelKey)}
            </h1>
          </div>
        )}

        {currentSection === "settings" ? (
          <SettingsPage
            onNavigateToSubscription={onNavigateToSubscription}
            onNavigateToDatabasesManager={onNavigateToDatabasesManager}
          />
        ) : ActivePage ? (
          <ActivePage />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            {t("setup.noDataYet")}
          </div>
        )}
      </main>
    </div>
  );
}