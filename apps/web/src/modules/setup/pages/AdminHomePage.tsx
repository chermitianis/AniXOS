import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, FileBarChart, Factory, CalendarClock, FolderKanban,
  ClipboardList, Calculator, ShoppingCart, Package, Users2, HardHat,
  Cog, ListChecks, Archive, Settings as SettingsIcon,
  LogOut, Menu, X, type LucideIcon,
} from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { hasPermission } from "../../../auth/permissions";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";
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
import { connectivityMonitor } from "../../../lib/connectivity";

type AdminSection =
  | "dashboard" | "workshop" | "planning" | "projects" | "manufacturing_orders"
  | "nomenclature" | "sales" | "inventory" | "clients" | "workers" | "machines"
  | "operations" | "archive" | "reports" | "settings";

interface NavItem {
  key: AdminSection;
  labelKey: string;
  icon: LucideIcon;
}
interface SectionGroup {
  titleKey: string;
  items: NavItem[];
}

const RAW_GROUPS: SectionGroup[] = [
  { titleKey: "navGroup.overview", items: [
    { key: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { key: "reports", labelKey: "nav.reports", icon: FileBarChart },
    { key: "workshop", labelKey: "nav.workshop", icon: Factory },
  ]},
  { titleKey: "navGroup.production", items: [
    { key: "projects", labelKey: "nav.projects", icon: FolderKanban },
    { key: "nomenclature", labelKey: "nav.nomenclature", icon: Calculator },
    { key: "manufacturing_orders", labelKey: "nav.manufacturing_orders", icon: ClipboardList },
    { key: "planning", labelKey: "nav.planning", icon: CalendarClock },
  ]},
  { titleKey: "navGroup.commerce", items: [
    { key: "sales", labelKey: "nav.sales", icon: ShoppingCart },
    { key: "inventory", labelKey: "nav.inventory", icon: Package },
    { key: "clients", labelKey: "nav.clients", icon: Users2 },
  ]},
  { titleKey: "navGroup.resources", items: [
    { key: "workers", labelKey: "nav.workers", icon: HardHat },
    { key: "machines", labelKey: "nav.machines", icon: Cog },
    { key: "operations", labelKey: "nav.operations", icon: ListChecks },
  ]},
  { titleKey: "navGroup.admin", items: [
    { key: "archive", labelKey: "nav.archive", icon: Archive },
    { key: "settings", labelKey: "nav.settings", icon: SettingsIcon },
  ]},
];

const PAGES: Record<AdminSection, React.ComponentType> = {
  dashboard: ManagerDashboardPage, reports: ReportsPage, workshop: WorkshopInfoPage,
  planning: PlanningAdminPage, projects: ProjectsAdminPage, manufacturing_orders: ManufacturingOrdersAdminPage,
  nomenclature: NomenclaturePage, sales: SalesAdminPage, inventory: InventoryAdminPage,
  clients: ClientsAdminPage, workers: WorkersAdminPage, machines: MachinesAdminPage,
  operations: OperationsAdminPage, archive: ArchivePage,
  settings: SettingsPage,
};

export function AdminHomePage() {
  const { t } = useTranslation();
  const { staffUser, role, signOut } = useStaffAuth();
  const [isOnline, setIsOnline] = useState(() => connectivityMonitor.getStatus());
  useEffect(() => connectivityMonitor.subscribe(setIsOnline), []);

  // تصفية حقيقية حسب الصلاحيات: المالك يرى كل شيء، وأي موظف آخر يرى فقط
  // الأقسام التي يملك دوره صلاحية "view" عليها صراحة — هذا ما كان مفقوداً
  // بالكامل سابقاً (نظام الصلاحيات كان معرَّفاً بالكود لكن غير مُفعَّل عملياً)
  const visibleGroups = RAW_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => staffUser?.is_owner || hasPermission(role, item.key, "view")
    ),
  })).filter((group) => group.items.length > 0);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  const [activeSection, setActiveSection] = useState<AdminSection | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const currentSection = activeSection && allVisibleItems.some((i) => i.key === activeSection)
    ? activeSection
    : (allVisibleItems[0]?.key ?? null);

  const ActivePage = currentSection ? PAGES[currentSection] : null;
  const currentItem = allVisibleItems.find((i) => i.key === currentSection);

  return (
    <div className="flex min-h-screen bg-slate-50 md:flex-row">
      {/* شريط علوي مخصص للجوال فقط — يحل محل الشريط الجانبي الثابت الذي كان
          يُقتطع عرضه على شاشة هاتف (w-64 من أصل ~375px لا يترك مساحة للمحتوى) */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5 md:hidden">
        <button onClick={() => setIsSidebarOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={t("common.menu")}>
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <AppLogo size="sm" />
          <span className="text-sm font-extrabold tracking-tight text-slate-800">AniXOS</span>
        </div>
        <ReclamationsBell />
      </div>

      {/* خلفية معتمة عند فتح الدرج على الجوال */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-50 w-72 flex-col overflow-y-auto border-e border-slate-200 bg-white transition-transform ${
          isSidebarOpen ? "flex" : "hidden"
        } md:static md:z-auto md:flex md:w-64`}
      >
        <div className="border-b border-slate-100 p-4">
          <div className="mb-2 flex items-center gap-2.5">
            <AppLogo size="sm" />
            <span className="flex-1 text-base font-extrabold tracking-tight text-slate-800">AniXOS</span>
            {/* جرس التنبيهات: مرئي من أي قسم إداري لأن réclamations العمال تتطلب رد فعل سريع بغض النظر عن الشاشة المفتوحة */}
            <div className="hidden md:block">
              <ReclamationsBell />
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden" aria-label={t("common.close")}>
              <X size={18} />
            </button>
          </div>
          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="truncate text-sm font-semibold text-slate-700">{staffUser?.full_name}</p>
            <div className="flex items-center justify-between gap-2"><p className="truncate text-xs text-slate-400">{role?.name}</p><span className="inline-flex items-center gap-1 text-[10px] text-slate-400"><span className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`} />{isOnline ? t("kiosk.online") : t("kiosk.offline")}</span></div>
          </div>
        </div>

        <nav className="flex-1 p-2">
          {visibleGroups.map((group) => (
            <div key={group.titleKey} className="mb-4">
              <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t(group.titleKey)}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentSection === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActiveSection(item.key);
                      setIsSidebarOpen(false);
                    }}
                    className={`group mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon size={17} className={isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"} />
                    <span className="flex-1">{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-2">
          <div className="mb-1 px-1">
            <LanguageSwitcher />
          </div>
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-semibold text-red-500 hover:bg-red-50"
          >
            <LogOut size={17} />
            {t("common.logout")}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        {currentItem && (
          <div className="mb-4 flex items-center gap-2.5 md:mb-6">
            <currentItem.icon size={22} className="text-indigo-600" />
            <h1 className="text-lg font-extrabold tracking-tight text-slate-800 md:text-xl">{t(currentItem.labelKey)}</h1>
          </div>
        )}

        {ActivePage ? (
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
