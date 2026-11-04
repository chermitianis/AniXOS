import {
  LayoutDashboard, BarChart3, Users, Landmark,
  Cog, Archive as ArchiveIcon, Shield, Settings2,
  FolderSearch, Calculator, FileBox, BadgeCheck,
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
  L("vue_ensemble", "Vue d'ensemble", { icon: LayoutDashboard, labelKey: "navGroup.overview", page: "dashboard", perm: "dashboard" }),

  {
    key: "commercial", labelKey: "navGroup.commercial", label: "Commercial", icon: Users,
    children: [
      L("crm_home", "Pipeline & Prospects", { page: "crm", perm: "crm" }),
      L("crm_clients", "Clients", { page: "clients", perm: "clients" }),
      L("crm_devis", "Devis", { page: "quotes", perm: "quotes" }),
    ],
  },

  {
    key: "ingenierie", labelKey: "navGroup.ingenierie", label: "Ingénierie", icon: FolderSearch,
    children: [
      L("ingenierie_projets", "Projets à étudier", { page: "projects", perm: "projects" }),
      L("ingenierie_nomenclature", "Nomenclature & chiffrage", { page: "nomenclature", perm: "nomenclature" }),
      L("ingenierie_dossiers", "Dossiers techniques", { page: "engineering_dossiers", perm: "nomenclature" }),
      L("ingenierie_rapports_prod", "Rapports production", { page: "production_reports", perm: "reports" }),
      L("ingenierie_validation", "Validation technique", { page: "engineering_validation", perm: "nomenclature" }),
    ],
  },

  {
    key: "production", labelKey: "navGroup.production", label: "Production", icon: Gauge,
    children: [
      L("production_dashboard", "Suivi OF", { page: "production_dashboard", perm: "production" }),
      L("production_preparation", "Préparation des dossiers", { page: "production_preparation", perm: "production" }),
      L("production_ordres", "Ordres de fabrication", { page: "manufacturing_orders", perm: "manufacturing_orders" }),
      L("production_planification", "Planification", { page: "planning", perm: "planning" }),
    ],
  },

  {
    key: "atelier", labelKey: "navGroup.atelier", label: "Atelier", icon: Wrench,
    children: [
      L("atelier_operateurs", "Opérateurs", { page: "workers", perm: "workers" }),
      L("atelier_machines_cnc", "Machines", { page: "machines", perm: "machines" }),
      L("atelier_operations", "Opérations", { page: "operations", perm: "operations" }),
      L("atelier_outillages", "Outillages"),
      L("atelier_matieres", "Matières & consommables"),
      L("atelier_equipements", "Équipements"),
      L("atelier_maintenance", "Maintenance"),
      L("atelier_ressources", "Ressources disponibles"),
    ],
  },

  {
    key: "finance", labelKey: "navGroup.finance", label: "Finance", icon: Landmark,
    children: [
      L("compta_dashboard", "Tableau de bord financier", { page: "accounting", perm: "accounting" }),
      L("compta_generale", "Comptabilité générale"),
      L("compta_clients", "Clients & encaissements"),
      L("compta_fournisseurs", "Fournisseurs & paiements"),
      L("compta_banque", "Banque & trésorerie"),
      L("compta_caisse", "Caisse"),
      L("compta_stocks", "Stocks & valorisation"),
      L("compta_analytique", "Comptabilité analytique"),
      L("compta_controle", "Contrôle de gestion"),
      L("compta_budgets", "Budgets & prévisions"),
      L("compta_immobilisations", "Immobilisations"),
      L("compta_paie", "Paie & charges sociales"),
      L("compta_fiscalite", "Fiscalité"),
      L("compta_rapports", "Rapports financiers"),
    ],
  },

  L("archive", "Archives", { icon: ArchiveIcon, labelKey: "navGroup.archives", page: "archive", perm: "archive" }),

  {
    key: "administration", labelKey: "navGroup.admin", label: "Administration", icon: Users2,
    children: [
      L("admin_users_liste", "Utilisateurs", { page: "admin_staff", perm: "staff" }),
      L("admin_users_roles", "Rôles", { page: "admin_roles", perm: "roles" }),
    ],
  },

  L("admin_securite_backup", "Sécurité & audit", { icon: Shield, labelKey: "navGroup.security", page: "admin_database", perm: "settings" }),

  L("admin_settings_generaux", "Paramètres", { icon: Settings2, labelKey: "navGroup.settings", page: "admin_general_settings", perm: "settings" }),

  L("admin_integrations_odoo", "Intégrations", { icon: Link2, labelKey: "navGroup.integrations", page: "admin_odoo", perm: "settings" }),
];