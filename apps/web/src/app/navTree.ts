import {
  LayoutDashboard, BarChart3, Users, Landmark,
  Cog, Archive as ArchiveIcon, Shield, Settings2,
  FolderSearch, Calculator, FileBox, Clock4, BadgeCheck,
  Gauge, ClipboardCheck, ClipboardList, CalendarClock,
  HardHat, Wrench, Hammer, Package, Boxes, AlertTriangle, Layers,
  ListChecks, Users2, Link2, DollarSign,
  type LucideIcon,
} from "lucide-react";

export interface NavNode {
  key: string;
  labelKey: string;
  label: string;
  icon?: LucideIcon;
  pageKey?: string;
  permissionKey?: string;
  children?: NavNode[];
}

export interface NavGroup {
  key: string;
  labelKey: string;
  label: string;
  items: NavNode[];
}

const L = (
  key: string,
  label: string,
  opts: { labelKey?: string; page?: string; perm?: string; icon?: LucideIcon } = {},
): NavNode => ({
  key,
  labelKey: opts.labelKey ?? `nav.${key}`,
  label,
  pageKey: opts.page,
  permissionKey: opts.perm,
  icon: opts.icon,
});

const G = (
  key: string,
  label: string,
  children: NavNode[],
  opts: { labelKey?: string; icon?: LucideIcon } = {},
): NavNode => ({
  key,
  labelKey: opts.labelKey ?? `nav.${key}`,
  label,
  icon: opts.icon,
  children,
});

export const NAV_TREE: NavGroup[] = [
  // ─────────────────────────────────────────────────────────────
  // 01. VUE D'ENSEMBLE
  // ─────────────────────────────────────────────────────────────
  {
    key: "vue_ensemble",
    labelKey: "navGroup.overview",
    label: "Vue d'ensemble",
    items: [
      L("dashboard", "Tableau de bord", { page: "dashboard", perm: "dashboard", icon: LayoutDashboard }),
      L("reports", "Statistiques", { page: "reports", perm: "reports", icon: BarChart3 }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 02. COMMERCIAL
  // ─────────────────────────────────────────────────────────────
  {
    key: "commercial",
    labelKey: "navGroup.commercial",
    label: "Commercial",
    items: [
      G("crm", "CRM", [
        L("crm_home", "Pipeline & Prospects", { page: "crm", perm: "crm" }),
        L("crm_clients", "Clients", { page: "clients", perm: "clients" }),
        L("crm_devis", "Devis", { page: "quotes", perm: "quotes" }),
      ], { icon: Users }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 03. INGÉNIERIE
  // ─────────────────────────────────────────────────────────────
  {
    key: "ingenierie",
    labelKey: "navGroup.ingenierie",
    label: "Ingénierie",
    items: [
      L("ingenierie_projets", "Projets à étudier", {
        page: "projects", perm: "projects", icon: FolderSearch,
      }),
      L("ingenierie_nomenclature", "Nomenclature & chiffrage", {
        page: "nomenclature", perm: "nomenclature", icon: Calculator,
      }),
      L("ingenierie_dossiers", "Dossiers techniques", {
        page: "engineering_dossiers", perm: "nomenclature", icon: FileBox,
      }),
      L("ingenierie_rapports_prod", "Rapports production", {
        page: "production_reports", perm: "reports", icon: BarChart3,
      }),
      L("ingenierie_validation", "Validation technique", {
        page: "engineering_validation", perm: "nomenclature", icon: BadgeCheck,
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 04. PRODUCTION
  // ─────────────────────────────────────────────────────────────
  {
    key: "production",
    labelKey: "navGroup.production",
    label: "Production",
    items: [
      L("production_dashboard", "Suivi OF", {
        page: "production_dashboard", perm: "production", icon: Gauge,
      }),
      L("production_preparation", "Préparation des dossiers", {
        page: "production_preparation", perm: "production", icon: ClipboardCheck,
      }),
      L("production_ordres", "Ordres de fabrication", {
        page: "manufacturing_orders", perm: "manufacturing_orders", icon: ClipboardList,
      }),
      L("production_planification", "Planification", {
        page: "planning", perm: "planning", icon: CalendarClock,
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 05. ATELIER
  // ─────────────────────────────────────────────────────────────
  {
    key: "atelier",
    labelKey: "navGroup.atelier",
    label: "Atelier",
    items: [
      L("atelier_operateurs", "Opérateurs", { page: "workers", perm: "workers", icon: HardHat }),
      L("atelier_machines_cnc", "Machines", { page: "machines", perm: "machines", icon: Cog }),
      L("atelier_operations", "Opérations", { page: "operations", perm: "operations", icon: ListChecks }),
      L("atelier_outillages", "Outillages", { icon: Hammer }),
      L("atelier_matieres", "Matières & consommables", { icon: Package }),
      L("atelier_equipements", "Équipements", { icon: Boxes }),
      L("atelier_maintenance", "Maintenance", { icon: AlertTriangle }),
      L("atelier_ressources", "Ressources disponibles", { icon: Layers }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 06. FINANCE
  // ─────────────────────────────────────────────────────────────
  {
    key: "finance",
    labelKey: "navGroup.finance",
    label: "Finance",
    items: [
      G("comptabilite", "Comptabilité", [
        L("compta_dashboard", "Tableau de bord financier", { page: "accounting", perm: "accounting" }),
        // ... (بقية العناصر كما هي)
      ], { icon: Landmark }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 07. ARCHIVES
  // ─────────────────────────────────────────────────────────────
  {
    key: "archives",
    labelKey: "navGroup.archives",
    label: "Archives",
    items: [
      L("archive", "Archives", { page: "archive", perm: "archive", icon: ArchiveIcon }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 08. ADMINISTRATION
  // ─────────────────────────────────────────────────────────────
  {
    key: "administration",
    labelKey: "navGroup.admin",
    label: "Administration",
    items: [
      // تحويل المجموعة إلى عناصر مباشرة
      L("admin_users_liste", "Utilisateurs", { page: "admin_staff", perm: "staff", icon: Users2 }),
      L("admin_users_roles", "Rôles", { page: "admin_roles", perm: "roles", icon: Users2 }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 09. SÉCURITÉ & AUDIT (عنصر مباشر)
  // ─────────────────────────────────────────────────────────────
  {
    key: "securite_audit",
    labelKey: "navGroup.security",
    label: "Sécurité & audit",
    items: [
      L("admin_securite_backup", "Sauvegarde / Réinitialisation", { page: "admin_database", perm: "settings", icon: Shield }),
      L("admin_securite_password", "Changer le mot de passe", { page: "admin_change_password", icon: Shield }),
      L("admin_securite_connexions", "Connexions", { page: "admin_security_qr", icon: Shield }),
      L("admin_securite_activites", "Activités utilisateurs", { icon: Shield }),
      L("admin_securite_historique", "Historique des modifications", { icon: Shield }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 10. PARAMÈTRES (عنصر مباشر)
  // ─────────────────────────────────────────────────────────────
  {
    key: "parametres",
    labelKey: "navGroup.settings",
    label: "Paramètres",
    items: [
      L("admin_settings_generaux", "Paramètres généraux", { page: "admin_general_settings", perm: "settings", icon: Settings2 }),
      L("admin_settings_work", "Paramètres de travail", { page: "admin_work_settings", perm: "settings", icon: Settings2 }),
      L("admin_settings_material_prices", "Prix des matières", { page: "admin_material_prices", perm: "settings", icon: DollarSign }),
      L("admin_settings_databases", "Bases de données", { page: "admin_databases", icon: Settings2 }),
      L("admin_settings_subscription", "Abonnement", { page: "admin_subscription", icon: Settings2 }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 11. INTÉGRATIONS (عنصر مباشر)
  // ─────────────────────────────────────────────────────────────
  {
    key: "integrations",
    labelKey: "navGroup.integrations",
    label: "Intégrations",
    items: [
      L("admin_integrations_odoo", "Odoo", { page: "admin_odoo", perm: "settings", icon: Link2 }),
    ],
  },
];
