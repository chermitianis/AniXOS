// ============================================================================
// قائمة وحدات النظام القابلة للتحكم بصلاحياتها. هذه ثابتة لأنها تعكس
// الميزات الفعلية المبنية في الكود — بخلاف "أسماء الأدوار" نفسها (owner,
// supervisor...) التي أصبحت الآن حرة بالكامل لكل شركة بعد استنساخها.
// ============================================================================

export interface PermissionModule {
  key: string;
  label: string;
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "workshop", label: "Atelier (Kiosk)" },
  { key: "planning", label: "Planification" },
  { key: "projects", label: "Projets" },
  { key: "manufacturing_orders", label: "Ordres de fabrication" },
  { key: "sales", label: "Ventes" },
  { key: "inventory", label: "Stock" },
  { key: "clients", label: "Clients" },
  { key: "workers", label: "Opérateurs" },
  { key: "machines", label: "Machines" },
  { key: "task_types", label: "Types de tâches" },
  { key: "stop_reasons", label: "Causes d'arrêt" },
  { key: "nomenclature", label: "Nomenclature" },
  { key: "reports", label: "Rapports" },
  { key: "archive", label: "Archives" },
  { key: "staff", label: "Employés" },
  { key: "roles", label: "Rôles et permissions" },
  { key: "settings", label: "Paramètres" },
];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "approve"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
