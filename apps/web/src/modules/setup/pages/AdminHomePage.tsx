import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu, X, Terminal, ChevronRight } from "lucide-react";
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
import { MaterialPricesPage } from "../../settings/pages/MaterialPricesPage";
import { CompanyWorkSettingsPage } from "../../settings/pages/CompanyWorkSettingsPage";
import { ProductionReportsPage } from "../../production-reports/pages/ProductionReportsPage";

// ---------------------------------------------------------------------------
// Pages mapping
// ---------------------------------------------------------------------------
const PAGES: Record<string, React.ComponentType> = {
  dashboard: ManagerDashboardPage,
  reports: ReportsPage,
  crm: CRMAdminPage,
  clients: ClientsAdminPage,
  nomenclature: NomenclaturePage,
  projects: ProjectsAdminPage,
  engineering_dossiers: DossiersTechniquesPage,
  production_reports: ProductionReportsPage,
  engineering_validation: ValidationTechniquePage,
  production_dashboard: ProductionDashboardPage,
  production_preparation: ProductionPreparationPage,
  manufacturing_orders: ManufacturingOrdersAdminPage,
  planning: PlanningAdminPage,
  accounting: AccountingAdminPage,
  quotes: SalesAdminPage,
  sales: SalesAdminPage,
  invoices: SalesAdminPage,
  inventory: InventoryAdminPage,
  purchases: InventoryAdminPage,
  workers: WorkersAdminPage,
  machines: MachinesAdminPage,
  operations: OperationsAdminPage,
  archive: ArchivePage,
  admin_staff: StaffAdminPage,
  admin_roles: RolesAdminPage,
  admin_general_settings: GeneralSettingsPage,
  admin_work_settings: CompanyWorkSettingsPage,
  admin_material_prices: MaterialPricesPage,
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

/** ✅ NEW — Trouve le groupe parent d'un node (pour le breadcrumb). */
function findGroupOfKey(groups: NavGroup[], key: string): NavGroup | null {
  function contains(nodes: NavNode[], k: string): boolean {
    for (const n of nodes) {
      if (n.key === k) return true;
      if (n.children && contains(n.children, k)) return true;
    }
    return false;
  }
  for (const g of groups) {
    if (contains(g.items, key)) return g;
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
  const currentGroup = currentKey ? findGroupOfKey(visibleGroups, currentKey) : null;

  const currentLabel = currentNode
    ? t(currentNode.labelKey, { defaultValue: currentNode.label })
    : "";

  const currentGroupLabel = currentGroup
    ? t(currentGroup.labelKey, { defaultValue: currentGroup.label })
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

  // User initials for avatar
  const userInitials = useMemo(() => {
    const name = staffUser?.full_name ?? "?";
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [staffUser?.full_name]);

  return (
    <ThemeProvider>
      <div
        className="flex h-screen flex-col overflow-hidden md:flex-row"
        style={{ backgroundColor: "var(--bg-app)" }}
      >
        {/* ====================================================================
            MOBILE HEADER
            ==================================================================== */}
        <header
          className="flex flex-shrink-0 items-center justify-between border-b px-3 py-2.5 md:hidden"
          style={{
            backgroundColor: "var(--sidebar-bg)",
            borderColor: "var(--sidebar-border)",
          }}
        >
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-lg p-2 text-[var(--sidebar-text)] transition hover:bg-white/10 active:bg-white/20"
            aria-label={t("common.menu")}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <AppLogo size="sm" />
            <span className="text-sm font-extrabold tracking-tight text-white">
              Ani<span style={{ color: "var(--brand-orange)" }}>XOS</span>
            </span>
          </div>
          <ReclamationsBell />
        </header>

        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ====================================================================
            SIDEBAR — Deep Navy
            ==================================================================== */}
        <aside
          className={`
            fixed inset-y-0 start-0 z-50 flex w-64 flex-col
            transition-transform duration-300 ease-in-out
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}
            md:static md:z-auto md:translate-x-0
            ${isCollapsed ? "md:w-[68px]" : "md:w-64"}
          `}
          style={{
            backgroundColor: "var(--sidebar-bg)",
            color: "var(--sidebar-text)",
            borderInlineEnd: "1px solid var(--sidebar-border)",
          }}
        >
          {/* ---- Brand + Collapse toggle ---- */}
          <div
            className={`relative flex-shrink-0 border-b ${
              isCollapsed ? "md:p-2 p-4" : "p-4"
            }`}
            style={{ borderColor: "var(--sidebar-border)" }}
          >
            <div
              className={`flex items-center ${
                isCollapsed ? "md:flex-col md:gap-2 mb-0" : "mb-3 gap-2.5"
              }`}
            >
              <AppLogo size="sm" />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-base font-extrabold tracking-tight text-white">
                    Ani<span style={{ color: "var(--brand-orange)" }}>XOS</span>
                  </span>
                  <div className="hidden md:block">
                    <ReclamationsBell dark />
                  </div>
                </>
              )}
              {isCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed(false)}
                  className="hidden md:flex rounded-lg p-1.5 text-[var(--sidebar-text-secondary)] transition hover:bg-white/10 hover:text-white"
                  title={t("common.expandMenu")}
                  aria-label={t("common.expandMenu")}
                >
                  <ChevronRight size={16} />
                </button>
              )}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-lg p-1.5 text-[var(--sidebar-text-secondary)] transition hover:bg-white/10 md:hidden"
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </div>

            {!isCollapsed && (
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="hidden md:flex absolute end-2 top-3.5 rounded-lg p-1 text-[var(--sidebar-text-secondary)] transition hover:bg-white/10 hover:text-white"
                title={t("common.collapseMenu")}
                aria-label={t("common.collapseMenu")}
              >
                <ChevronRight size={16} className="rotate-180" />
              </button>
            )}

            {/* ---- User Card ---- */}
            {!isCollapsed && (
              <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-2.5 py-2">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: "var(--brand-orange)" }}
                >
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {staffUser?.full_name ?? "—"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[11px] text-[var(--sidebar-text-secondary)]">
                      {role?.name ?? ""}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--sidebar-text-muted)]">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isOnline ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                      {isOnline ? t("kiosk.online") : t("kiosk.offline")}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ---- Navigation ---- */}
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            {visibleGroups.map((group) => {
              const isGroupExpanded = expandedKeys.has(group.key);
              const groupLabel = t(group.labelKey, { defaultValue: group.label });
              return (
                <div key={group.key} className="mb-2">
                  {!isCollapsed ? (
                    <button
                      type="button"
                      onClick={() => handleToggleGroup(group.key)}
                      className="mb-0.5 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition"
                      style={{ color: "var(--sidebar-group-label)" }}
                    >
                      <span className="truncate">{groupLabel}</span>
                      <ChevronRight
                        size={11}
                        strokeWidth={2.5}
                        className={`shrink-0 transition-transform ${
                          isGroupExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                  ) : (
                    <div className="mx-2 my-2 h-px" style={{ backgroundColor: "var(--sidebar-border)" }} />
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

          {/* ---- Footer: Developer Panel ---- */}
          <div
            className={`flex-shrink-0 border-t p-2 ${isCollapsed ? "md:px-1" : ""}`}
            style={{ borderColor: "var(--sidebar-border)" }}
          >
            {onNavigateToDeveloperPanel && isDeveloper && (
              <button
                onClick={onNavigateToDeveloperPanel}
                className={`flex w-full items-center rounded-lg text-start text-sm font-semibold text-[var(--sidebar-text-secondary)] transition hover:bg-white/5 hover:text-white ${
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

        {/* ====================================================================
            MAIN AREA
            ==================================================================== */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* ---- TOP BAR ---- */}
          <header
            className="flex flex-shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-6"
            style={{
              backgroundColor: "var(--topbar-bg)",
              borderColor: "var(--topbar-border)",
            }}
          >
            {/* Breadcrumb */}
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <span
                className="shrink-0 font-extrabold tracking-tight"
                style={{ color: "var(--topbar-text)" }}
              >
                Ani<span style={{ color: "var(--brand-orange)" }}>XOS</span>
              </span>
              {currentGroupLabel && (
                <>
                  <ChevronRight size={14} className="shrink-0 opacity-40" />
                  <span className="truncate" style={{ color: "var(--topbar-text-secondary)" }}>
                    {currentGroupLabel}
                  </span>
                </>
              )}
              {!showProfile && currentLabel && (
                <>
                  <ChevronRight size={14} className="shrink-0 opacity-40" />
                  <span className="truncate font-semibold" style={{ color: "var(--topbar-text)" }}>
                    {currentLabel}
                  </span>
                </>
              )}
              {showProfile && (
                <>
                  <ChevronRight size={14} className="shrink-0 opacity-40" />
                  <span className="truncate font-semibold" style={{ color: "var(--topbar-text)" }}>
                    {t("settings.myProfile", { defaultValue: "Mon Profil" })}
                  </span>
                </>
              )}
            </div>

            {/* Actions */}
            <TopRightActions onOpenProfile={() => setShowProfile(true)} />
          </header>

          {/* ---- Scrollable content ---- */}
          <main
            ref={mainScrollRef}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6"
            style={{ backgroundColor: "var(--bg-app)" }}
          >
            <NavContext.Provider value={navValue}>
              {/* Page title */}
              {!showProfile && currentNode && (
                <div className="mb-4 flex items-center gap-2.5 md:mb-6">
                  {CurrentIcon && (
                    <CurrentIcon
                      size={22}
                      className="shrink-0"
                      style={{ color: "var(--brand-orange)" }}
                    />
                  )}
                  <h1
                    className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight md:text-2xl"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {currentLabel}
                  </h1>
                </div>
              )}

              {currentKey === "admin_change_password" ? (
                <div
                  className="rounded-xl border p-8 text-center"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                    {t("myProfile.changePasswordTitle")}
                  </p>
                  <button
                    onClick={() => setShowChangePassword(true)}
                    className="rounded-lg px-5 py-2.5 text-sm font-bold text-white transition"
                    style={{ backgroundColor: "var(--brand-orange)" }}
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
                <div
                  className="rounded-xl border border-dashed p-10 text-center text-sm"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-strong)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {t("setup.noDataYet")}
                </div>
              )}
            </NavContext.Provider>
          </main>
        </div>

        {showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        )}
      </div>
    </ThemeProvider>
  );
}