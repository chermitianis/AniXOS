// ============================================================================
// Liste des modules système dont les permissions sont contrôlables.
// Reflète les fonctionnalités réellement implémentées dans le code.
// ============================================================================

export interface PermissionModule {
  key: string;
  label: string;
}

export const PERMISSION_MODULES: PermissionModule[] = [
  // --- Vue d'ensemble ---
  { key: "dashboard", label: "Tableau de bord" },
  { key: "reports", label: "Statistiques" },
  { key: "workshop", label: "Atelier (Kiosk)" },

  // --- Atelier / CRM ---
  { key: "crm", label: "CRM (Prospects & Opportunités)" },

  // --- Production ---
  { key: "nomenclature", label: "Étude du projet" },
  { key: "projects", label: "Projets" },
  { key: "manufacturing_orders", label: "Ordres de fabrication" },
  { key: "planning", label: "Planification" },
  { key: "accounting", label: "Comptabilité" },

  // --- Commerce (avec sous-menus) ---
  { key: "quotes", label: "Devis" },
  { key: "sales", label: "Ventes" },
  { key: "invoices", label: "Factures" },
  { key: "inventory", label: "Stock" },
  { key: "purchases", label: "Achats" },
  { key: "clients", label: "Clients" },

  // --- Ressources ---
  { key: "workers", label: "Opérateurs" },
  { key: "machines", label: "Machines CNC" },
  { key: "operations", label: "Opérations de production" },

  // --- Administration ---
  { key: "archive", label: "Archives" },
  { key: "staff", label: "Employés" },
  { key: "roles", label: "Rôles et permissions" },
  { key: "settings", label: "Paramètres" },
];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "approve"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];