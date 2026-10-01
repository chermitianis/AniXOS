// ============================================================================
// Constantes métier du chiffrage
//   - Étapes (STAGES) avec mode de facturation :
//       billing: "hours"  → estimated_hours × hourly_rate
//       billing: "pieces" → quantity_pieces × unit_price
//   - Types STT (STT_TYPES) : Broni, Zingué, Nickelé, etc.
// ============================================================================

export type CostingStage =
  | "usinage_cnc"
  | "usinage_classique"
  | "rectification"
  | "ajustage"
  | "taraudage"
  | "stt"
  | "anodisation"
  | "controle_qualite"
  | "autre"
  // Legacy (lecture seule)
  | "tournage_cnc"
  | "fraisage_cnc"
  | "tournage_classique"
  | "fraisage_classique";

export type OperationInterface = "cnc" | "classique";
export type BillingMode = "hours" | "pieces";

export interface StageDef {
  key: CostingStage;
  labelKey: string;
  icon: string;
  color: string;
  interface: OperationInterface;
  billing: BillingMode;
  isPivot?: boolean;
  isUnique?: boolean;
  deprecated?: boolean;
  defaultHourlyRate?: number;
  defaultUnitPrice?: number;
  hintKey?: string;
}

export const STAGES: StageDef[] = [
  // ─── CNC ─────────────────────────────────────────────────────────
  {
    key: "usinage_cnc",
    labelKey: "costing.stage.usinage_cnc",
    hintKey: "costing.stage.usinage_cnc_hint",
    icon: "🎯",
    color: "amber",
    interface: "cnc",
    billing: "hours",
    isPivot: true,
    isUnique: true,
    defaultHourlyRate: 45,
  },

  // ─── Classique ───────────────────────────────────────────────────
  {
    key: "usinage_classique",
    labelKey: "costing.stage.usinage_classique",
    hintKey: "costing.stage.usinage_classique_hint",
    icon: "⚙️",
    color: "blue",
    interface: "classique",
    billing: "hours",
    isUnique: true,
    defaultHourlyRate: 35,
  },
  { key: "rectification",    labelKey: "costing.stage.rectification",    icon: "📐", color: "indigo",  interface: "classique", billing: "hours", defaultHourlyRate: 40 },
  { key: "ajustage",         labelKey: "costing.stage.ajustage",         icon: "🔧", color: "violet",  interface: "classique", billing: "hours", defaultHourlyRate: 35 },
  { key: "taraudage",        labelKey: "costing.stage.taraudage",        icon: "🔩", color: "violet",  interface: "classique", billing: "hours", defaultHourlyRate: 30 },

  // ─── STT ─── facturation par PIÈCE ─────────────────────────────
  {
    key: "stt",
    labelKey: "costing.stage.stt",
    icon: "🔥",
    color: "teal",
    interface: "classique",
    billing: "pieces",
    defaultUnitPrice: 5,
  },

  // ─── Anodisation ─── facturation par PIÈCE ─────────────────────
  {
    key: "anodisation",
    labelKey: "costing.stage.anodisation",
    icon: "🧪",
    color: "fuchsia",
    interface: "classique",
    billing: "pieces",
    defaultUnitPrice: 8,
  },

  { key: "controle_qualite", labelKey: "costing.stage.controle_qualite", icon: "✅", color: "emerald", interface: "classique", billing: "hours", defaultHourlyRate: 25 },
  { key: "autre",            labelKey: "costing.stage.autre",            icon: "➕", color: "slate",   interface: "classique", billing: "hours" },

  // ─── Legacy (lecture seule) ────────────────────────────────────
  { key: "tournage_cnc",       labelKey: "costing.stage.tournage_cnc",       icon: "🌀", color: "amber", interface: "cnc",       billing: "hours", defaultHourlyRate: 45, deprecated: true },
  { key: "fraisage_cnc",       labelKey: "costing.stage.fraisage_cnc",       icon: "🛠️", color: "amber", interface: "cnc",       billing: "hours", defaultHourlyRate: 45, deprecated: true },
  { key: "tournage_classique", labelKey: "costing.stage.tournage_classique", icon: "🔄", color: "sky",   interface: "classique", billing: "hours", defaultHourlyRate: 30, deprecated: true },
  { key: "fraisage_classique", labelKey: "costing.stage.fraisage_classique", icon: "🔨", color: "sky",   interface: "classique", billing: "hours", defaultHourlyRate: 35, deprecated: true },
];

export function getStageDef(key: CostingStage): StageDef {
  return STAGES.find((s) => s.key === key) ?? STAGES[STAGES.length - 1];
}

export function getStageInterface(key: string | null | undefined): OperationInterface {
  if (!key) return "classique";
  const def = STAGES.find((s) => s.key === key);
  return def?.interface ?? "classique";
}

export function getStageBilling(key: string | null | undefined): BillingMode {
  if (!key) return "hours";
  const def = STAGES.find((s) => s.key === key);
  return def?.billing ?? "hours";
}

export function getAvailableStages(usedKeys: string[]): StageDef[] {
  const used = new Set(usedKeys);
  return STAGES.filter((s) => {
    if (s.deprecated) return false;
    if (s.isUnique && used.has(s.key)) return false;
    return true;
  });
}

export function canAddStage(key: CostingStage, usedKeys: string[]): boolean {
  const def = STAGES.find((s) => s.key === key);
  if (!def) return false;
  if (def.deprecated) return false;
  if (def.isUnique && usedKeys.includes(key)) return false;
  return true;
}

// ----------------------------------------------------------------------------
// Types STT (broni, zingué, nickelé, ...)
// ----------------------------------------------------------------------------
export interface SttTypeDef {
  key: string;
  label: string;
}

export const STT_TYPES: SttTypeDef[] = [
  { key: "broni",        label: "Broni" },
  { key: "zingue_blanc", label: "Zingué blanc" },
  { key: "zingue_jaune", label: "Zingué jaune" },
  { key: "nickele",      label: "Nickelé" },
  { key: "chrome",       label: "Chromé" },
  { key: "chrome_dur",   label: "Chromé dur" },
  { key: "phosphatation",label: "Phosphatation" },
  { key: "noir",         label: "Noir (oxydation)" },
  { key: "peinture",     label: "Peinture" },
  { key: "thermique",    label: "Traitement thermique" },
  { key: "autre",        label: "Autre" },
];

export function getSttTypeLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return STT_TYPES.find((s) => s.key === key)?.label ?? key;
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
  { key: "piece", label: "pièce" },
] as const;

export type MaterialUnit = (typeof MATERIAL_UNITS)[number]["key"];

// ----------------------------------------------------------------------------
// Compatibilité : ancien export MATERIAL_PRESETS (déprécié)
// ----------------------------------------------------------------------------
import {
  MATERIALS as ALL_MATERIALS,
  type Material as FullMaterial,
} from "../../../shared/constants/materials";

export interface MaterialPreset {
  name: string;
  code: string;
  defaultUnit: MaterialUnit;
  category: string;
}

export const MATERIAL_PRESETS: MaterialPreset[] = ALL_MATERIALS.map(
  (m: FullMaterial) => ({
    name: m.label,
    code: m.code,
    defaultUnit: (m.defaultUnit as MaterialUnit) ?? "kg",
    category: m.category,
  }),
);