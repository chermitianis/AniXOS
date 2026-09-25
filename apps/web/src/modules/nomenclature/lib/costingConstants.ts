// ============================================================================
// Constantes métier du chiffrage — étapes & matières
// ============================================================================

export type CostingStage =
  | "usinage_cnc"
  | "tournage_cnc"
  | "fraisage_cnc"
  | "tournage_classique"
  | "fraisage_classique"
  | "usinage_classique"
  | "rectification"
  | "ajustage"
  | "taraudage"
  | "stt"
  | "anodisation"
  | "controle_qualite"
  | "autre";

export type OperationInterface = "cnc" | "manual";

export interface StageDef {
  key: CostingStage;
  labelKey: string;
  icon: string;
  color: string;
  interface: OperationInterface;
  isPivot?: boolean;
  defaultHourlyRate?: number;
}

export const STAGES: StageDef[] = [
  // ─── CNC ───────────────────────────────────────────────────────────
  { key: "usinage_cnc",        labelKey: "costing.stage.usinage_cnc",        icon: "🎯", color: "amber",   interface: "cnc",    isPivot: true, defaultHourlyRate: 45 },
  { key: "tournage_cnc",       labelKey: "costing.stage.tournage_cnc",       icon: "🌀", color: "amber",   interface: "cnc",    defaultHourlyRate: 45 },

  // ─── Manuel ────────────────────────────────────────────────────────
  { key: "usinage_classique",  labelKey: "costing.stage.usinage_classique",  icon: "⚙️", color: "blue",    interface: "manual", defaultHourlyRate: 35 },
  { key: "tournage_classique", labelKey: "costing.stage.tournage_classique", icon: "🔄", color: "sky",     interface: "manual", defaultHourlyRate: 30 },
  { key: "rectification",      labelKey: "costing.stage.rectification",      icon: "📐", color: "indigo",  interface: "manual", defaultHourlyRate: 40 },
  { key: "ajustage",           labelKey: "costing.stage.ajustage",           icon: "🔧", color: "violet",  interface: "manual", defaultHourlyRate: 35 },
  { key: "taraudage",          labelKey: "costing.stage.taraudage",          icon: "🔩", color: "violet",  interface: "manual", defaultHourlyRate: 30 },
  { key: "stt",                labelKey: "costing.stage.stt",                icon: "🔥", color: "teal",    interface: "manual", defaultHourlyRate: 40 },
  { key: "anodisation",        labelKey: "costing.stage.anodisation",        icon: "🧪", color: "fuchsia", interface: "manual", defaultHourlyRate: 50 },
  { key: "controle_qualite",   labelKey: "costing.stage.controle_qualite",   icon: "✅", color: "emerald", interface: "manual", defaultHourlyRate: 25 },
  { key: "autre",              labelKey: "costing.stage.autre",              icon: "➕", color: "slate",   interface: "manual" },
];

export function getStageDef(key: CostingStage): StageDef {
  return STAGES.find((s) => s.key === key) ?? STAGES[STAGES.length - 1];
}

export function getStageInterface(key: string | null | undefined): OperationInterface {
  if (!key) return "manual";
  const def = STAGES.find((s) => s.key === key);
  return def?.interface ?? "manual";
}

// ----------------------------------------------------------------------------
// Unités de matière
// ----------------------------------------------------------------------------
export const MATERIAL_UNITS = [
  { key: "kg",    label: "kg" },
  { key: "g",     label: "g" },
  { key: "m",     label: "m" },
  { key: "cm",    label: "cm" },
  { key: "mm",    label: "mm" },
  { key: "m2",    label: "m²" },
  { key: "m3",    label: "m³" },
  { key: "L",     label: "L" },
  { key: "ml",    label: "ml" },
  { key: "pièce", label: "pièce" },
] as const;

export type MaterialUnit = (typeof MATERIAL_UNITS)[number]["key"];

// ----------------------------------------------------------------------------
// Matières prédéfinies
// ----------------------------------------------------------------------------
export interface MaterialPreset {
  name: string;
  code: string;
  defaultUnit: MaterialUnit;
  category: "acier" | "alu" | "inox" | "laiton" | "fonte" | "plastique" | "consommable" | "autre";
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { name: "Acier XC48",        code: "XC48",    defaultUnit: "kg", category: "acier" },
  { name: "Acier XC38",        code: "XC38",    defaultUnit: "kg", category: "acier" },
  { name: "Acier C45",         code: "C45",     defaultUnit: "kg", category: "acier" },
  { name: "Acier 42CrMo4",     code: "42CrMo4", defaultUnit: "kg", category: "acier" },
  { name: "Acier de décolletage S235", code: "S235", defaultUnit: "kg", category: "acier" },
  { name: "Aluminium 2017A",   code: "2017A",   defaultUnit: "kg", category: "alu" },
  { name: "Aluminium 2024",    code: "2024",    defaultUnit: "kg", category: "alu" },
  { name: "Aluminium 6060",    code: "6060",    defaultUnit: "kg", category: "alu" },
  { name: "Aluminium 7075",    code: "7075",    defaultUnit: "kg", category: "alu" },
  { name: "Inox 304",          code: "304",     defaultUnit: "kg", category: "inox" },
  { name: "Inox 316",          code: "316",     defaultUnit: "kg", category: "inox" },
  { name: "Inox 316L",         code: "316L",    defaultUnit: "kg", category: "inox" },
  { name: "Laiton CuZn39Pb2",  code: "CuZn39",  defaultUnit: "kg", category: "laiton" },
  { name: "Bronze CuSn8",      code: "CuSn8",   defaultUnit: "kg", category: "laiton" },
  { name: "Fonte GS 500-7",    code: "GS500",   defaultUnit: "kg", category: "fonte" },
  { name: "Fonte FGL 250",     code: "FGL250",  defaultUnit: "kg", category: "fonte" },
  { name: "PA6 (Nylon)",       code: "PA6",     defaultUnit: "kg", category: "plastique" },
  { name: "POM (Delrin)",      code: "POM",     defaultUnit: "kg", category: "plastique" },
  { name: "PTFE (Téflon)",     code: "PTFE",    defaultUnit: "kg", category: "plastique" },
  { name: "Huile de coupe",    code: "HC",      defaultUnit: "L",  category: "consommable" },
  { name: "Peinture",          code: "PEIN",    defaultUnit: "L",  category: "consommable" },
  { name: "Vernis",            code: "VERN",    defaultUnit: "L",  category: "consommable" },
];