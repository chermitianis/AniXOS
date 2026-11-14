import {
  LayoutDashboard, BarChart3, Users, Landmark,
  Cog, Archive as ArchiveIcon, Shield, Settings2,
  FolderSearch, Calculator, FileBox, BadgeCheck,
  Gauge, ClipboardCheck, ClipboardList, CalendarClock,
  HardHat, Wrench, Hammer, Package, Boxes, AlertTriangle, Layers,
  ListChecks, Users2, Link2, DollarSign, FileText, History, TrendingUp,
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

const L = (
  key: string,
  label: string,
  opts: { page?: string; perm?: string; icon?: LucideIcon; labelKey?: string } = {},
): NavNode => ({
  key,
  labelKey: opts.labelKey ?? `nav.${key}`,
  label,
  pageKey: opts.page,
  permissionKey: opts.perm,
  icon: opts.icon,
});

export const NAV_TREE: NavNode[] = [
  // 1. Vue d'ensemble
  {
    key: "vue_ensemble",
    labelKey: "navGroup.overview",
    label: "Vue d'ensemble",
    icon: LayoutDashboard,
    children: [
      L("dashboard", "Dashboard", { page: "dashboard", perm: "dashboard" }),
      L("reports", "Statistiques", { page: "reports", perm: "reports" }),
    ],
  },

  // 2. Ventes & Commerce
  {
    key: "ventes_commerce",
    labelKey: "navGroup.ventes_commerce",
    label: "Ventes & Commerce",
    icon: Users,
    children: [
      L("crm_home", "Pipeline (CRM)", { page: "crm", perm: "crm" }),
      L("crm_clients", "Clients", { page: "clients", perm: "clients" }),
      L("crm_devis", "Devis", { page: "quotes", perm: "quotes" }),
      L("crm_commandes", "Commandes", { page: "orders", perm: "orders" }),
    ],
  },

  // 3. Achats & Stock
  {
    key: "achats_stock", labelKey: "navGroup.achats_stock", label: "Achats & Stock", icon: Package,
    children: [
      L("achats_fournisseurs", "Fournisseurs", { page: "suppliers", perm: "suppliers" }),
      L("achats_commandes", "Commandes d'achat", { page: "purchase_orders", perm: "purchase_orders" }),
      L("stock_produits", "Produits & Matières", { page: "products", perm: "products" }),
      L("stock_mouvements", "Mouvements", { page: "stock_movements", perm: "stock_movements" }),
    ],
  },

  // 4. Ingénierie
  {
    key: "ingenierie", labelKey: "navGroup.ingenierie", label: "Ingénierie", icon: FolderSearch,
    children: [
      L("ingenierie_projets", "Projets à étudier", { page: "projects", perm: "projects" }),
      L("ingenierie_nomenclature", "Nomenclature", { page: "nomenclature", perm: "nomenclature" }),
      L("ingenierie_dossiers", "Dossiers techniques", { page: "engineering_dossiers", perm: "nomenclature" }),
      L("ingenierie_validation", "Validation", { page: "engineering_validation", perm: "nomenclature" }),
      L("ingenierie_documents", "Documents", { page: "engineering_documents", perm: "nomenclature" }),
      L("ingenierie_revisions", "Révisions", { page: "engineering_revisions", perm: "nomenclature" }),
    ],
  },

  // 5. Fabrication
  {
    key: "fabrication", labelKey: "navGroup.fabrication", label: "Fabrication", icon: Gauge,
    children: [
      L("production_dashboard", "Suivi OF", { page: "production_dashboard", perm: "production" }),
      L("production_lancement", "Lancement", { page: "production_launch", perm: "production" }),
      L("production_ordres", "Ordres de fabrication", { page: "manufacturing_orders", perm: "manufacturing_orders" }),
      L("production_planification", "Planification", { page: "planning", perm: "planning" }),
      L("production_qualite", "Qualité", { page: "quality", perm: "quality" }),
      L("production_couts", "Coûts", { page: "production_costs", perm: "production" }),
      {
        key: "atelier", labelKey: "navGroup.atelier", label: "Atelier", icon: Wrench,
        children: [
          L("atelier_operateurs", "Opérateurs", { page: "workers", perm: "workers" }),
          L("atelier_machines", "Machines", { page: "machines", perm: "machines" }),
          L("atelier_operations", "Opérations", { page: "operations", perm: "operations" }),
          L("atelier_outillages", "Outillages", { page: "tooling", perm: "tooling" }),
          L("atelier_matieres", "Matières", { page: "materials", perm: "materials" }),
          L("atelier_equipements", "Équipements", { page: "equipment", perm: "equipment" }),
          L("atelier_maintenance", "Maintenance", { page: "maintenance", perm: "maintenance" }),
          L("atelier_ressources", "Ressources", { page: "resources", perm: "resources" }),
        ],
      },
    ],
  },

  // 6. Finance
  {
    key: "finance", labelKey: "navGroup.finance", label: "Finance", icon: Landmark,
    children: [
      L("compta_dashboard", "Dashboard", { page: "accounting", perm: "accounting" }),
      L("compta_generale", "Compta. Générale", { page: "accounting_general", perm: "accounting" }),
      L("compta_encaissements", "Encaissements", { page: "accounting_receipts", perm: "accounting" }),
      L("compta_paiements", "Paiements", { page: "accounting_payments", perm: "accounting" }),
      L("compta_tresorerie", "Trésorerie", { page: "accounting_treasury", perm: "accounting" }),
      L("compta_caisse", "Caisse", { page: "accounting_cash", perm: "accounting" }),
      L("compta_valorisation", "Valorisation", { page: "accounting_valuation", perm: "accounting" }),
      L("compta_analytique", "Analytique", { page: "accounting_analytic", perm: "accounting" }),
      L("compta_controle", "Contrôle", { page: "accounting_control", perm: "accounting" }),
      L("compta_budgets", "Budgets", { page: "accounting_budgets", perm: "accounting" }),
      L("compta_immobilisations", "Immobilisations", { page: "accounting_assets", perm: "accounting" }),
      L("compta_paie", "Paie", { page: "accounting_payroll", perm: "accounting" }),
      L("compta_fiscalite", "Fiscalité", { page: "accounting_tax", perm: "accounting" }),
      L("compta_rapports", "Rapports", { page: "accounting_reports", perm: "accounting" }),
    ],
  },

  // 7. Archives (موسع)
  {
    key: "archives", labelKey: "navGroup.archives", label: "Archives", icon: ArchiveIcon,
    children: [
      L("archives_projets", "Tous les projets", { page: "archive_projects", perm: "archive" }),
      L("archives_pieces", "Toutes les pièces", { page: "archive_pieces", perm: "archive" }),
      L("archives_couts", "Historique des coûts", { page: "archive_costs", perm: "archive" }),
      L("archives_clients", "Historique des clients", { page: "archive_clients", perm: "archive" }),
      L("archives_rapports", "Rapports d'archives", { page: "archive_reports", perm: "archive" }),
    ],
  },

  // 8. Administration (كما هي بالضبط)
  {
    key: "administration", labelKey: "navGroup.admin", label: "Administration", icon: Users2,
    children: [
      L("admin_users_liste", "Utilisateurs", { page: "admin_staff", perm: "staff" }),
      L("admin_users_roles", "Rôles", { page: "admin_roles", perm: "roles" }),
    ],
  },

  // 9. Sécurité & audit (كما هي بالضبط)
  {
    key: "securite_audit",
    labelKey: "navGroup.security",
    label: "Sécurité & audit",
    icon: Shield,
    children: [
      L("admin_securite_backup", "Sauvegarde / Réinitialisation", { page: "admin_database", perm: "settings" }),
      L("admin_securite_password", "Changer le mot de passe", { page: "admin_change_password" }),
      L("admin_securite_connexions", "Connexions", { page: "admin_security_qr" }),
      L("admin_securite_activites", "Activités utilisateurs"),
      L("admin_securite_historique", "Historique des modifications"),
    ],
  },

  // 10. Paramètres (كما هي بالضبط)
  {
    key: "parametres",
    labelKey: "navGroup.settings",
    label: "Paramètres",
    icon: Settings2,
    children: [
      L("admin_settings_generaux", "Paramètres généraux", { page: "admin_general_settings", perm: "settings" }),
      L("admin_settings_work", "Paramètres de travail", { page: "admin_work_settings", perm: "settings" }),
      L("admin_settings_material_prices", "Prix des matières", { page: "admin_material_prices", perm: "settings" }),
      L("admin_settings_databases", "Bases de données", { page: "admin_databases" }),
      L("admin_settings_subscription", "Abonnement", { page: "admin_subscription" }),
    ],
  },

  // 11. Intégrations (كما هي بالضبط)
  {
    key: "integrations",
    labelKey: "navGroup.integrations",
    label: "Intégrations",
    icon: Link2,
    children: [
      L("admin_integrations_odoo", "Odoo", { page: "admin_odoo", perm: "settings" }),
    ],
  },

  // في navTree.ts، أضف هذا العنصر (بدون أيقونة، أو في قسم Ventes & Commerce)
{
  key: "order_detail",
  labelKey: "navGroup.orderDetail",
  label: "Détail Commande",
  pageKey: "order_detail",
  // لا نضع icon، لأنها صفحة تفاصيل
}
];