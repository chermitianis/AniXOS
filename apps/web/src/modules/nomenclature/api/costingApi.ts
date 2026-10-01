// ============================================================================
// costingApi — CRUD opérations + matières
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";
import type { CostingStage, MaterialUnit } from "../lib/costingConstants";

export type MaterialCalcMode = "weight" | "rect" | "cyl";

export interface CostingOperation {
  id: string;
  company_id: string;
  nomenclature_id: string;
  piece_task_id: string | null;
  stage: CostingStage;
  label: string | null;
  estimated_hours: number;
  hourly_rate: number;
  quantity_pieces: number;      // ← pour STT / Anodisation
  unit_price: number | null;    // ← pour STT / Anodisation
  stt_type: string | null;      // ← pour STT
  subtotal: number;
  notes: string | null;
  sequence_order: number;
  created_at: string;
  updated_at: string;
}

export interface CostingMaterial {
  id: string;
  company_id: string;
  nomenclature_id: string;
  piece_task_id: string | null;

  material_name: string;
  material_code: string | null;

  calculation_mode: MaterialCalcMode;
  mass_volumique: number | null;

  diameter: number | null;
  length: number | null;
  width: number | null;
  thickness: number | null;

  quantity_pieces: number;
  quantity: number;
  unit: MaterialUnit;
  unit_price: number;
  price_per_kg: number | null;
  material_total: number | null;

  subtotal: number;
  notes: string | null;
  sequence_order: number;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Calculs matière (identiques au client)
// ----------------------------------------------------------------------------
export function computePieceWeightKg(
  mode: MaterialCalcMode,
  dims: {
    length?: number | null;
    width?: number | null;
    thickness?: number | null;
    diameter?: number | null;
    massVolumique?: number | null;
    manualKg?: number | null;
  },
): number {
  const d = dims.massVolumique ?? 0;
  if (mode === "weight") return dims.manualKg ?? 0;
  if (mode === "cyl") {
    const diam = dims.diameter ?? 0;
    const l = dims.length ?? 0;
    if (diam <= 0 || l <= 0) return 0;
    const volumeMm3 = Math.PI * Math.pow(diam / 2, 2) * l;
    return (volumeMm3 / 1_000_000) * d;
  }
  if (mode === "rect") {
    const l = dims.length ?? 0;
    const w = dims.width ?? 0;
    const t = dims.thickness ?? 0;
    if (l <= 0 || w <= 0 || t <= 0) return 0;
    const volumeMm3 = l * w * t;
    return (volumeMm3 / 1_000_000) * d;
  }
  return 0;
}

export function computeMaterialTotal(
  mode: MaterialCalcMode,
  dims: {
    length?: number | null;
    width?: number | null;
    thickness?: number | null;
    diameter?: number | null;
    massVolumique?: number | null;
    manualKg?: number | null;
  },
  quantityPieces: number,
  pricePerKg: number,
): { weightPerPiece: number; totalWeight: number; total: number } {
  const weightPerPiece = computePieceWeightKg(mode, dims);
  const totalWeight = weightPerPiece * (quantityPieces || 1);
  const total = totalWeight * (pricePerKg || 0);
  return { weightPerPiece, totalWeight, total };
}

// ----------------------------------------------------------------------------
// OPERATIONS
// ----------------------------------------------------------------------------
export async function listOperations(
  companyId: string,
  nomenclatureId: string,
): Promise<CostingOperation[]> {
  const { data, error } = await supabase
    .from("piece_costing_operations")
    .select("*")
    .eq("company_id", companyId)
    .eq("nomenclature_id", nomenclatureId)
    .order("sequence_order");
  if (error) throw error;
  return (data as CostingOperation[]) ?? [];
}

export async function listOperationsForPiece(
  companyId: string,
  pieceTaskId: string,
): Promise<CostingOperation[]> {
  const { data, error } = await supabase
    .from("piece_costing_operations")
    .select("*")
    .eq("company_id", companyId)
    .eq("piece_task_id", pieceTaskId)
    .order("sequence_order");
  if (error) throw error;
  return (data as CostingOperation[]) ?? [];
}

export async function createOperation(
  input: Omit<CostingOperation, "id" | "subtotal" | "created_at" | "updated_at">,
): Promise<CostingOperation> {
  const { data, error } = await supabase
    .from("piece_costing_operations")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as CostingOperation;
}

export async function updateOperation(
  id: string,
  companyId: string,
  patch: Partial<Pick<CostingOperation,
    | "stage" | "label"
    | "estimated_hours" | "hourly_rate"
    | "quantity_pieces" | "unit_price" | "stt_type"
    | "notes" | "sequence_order">>,
): Promise<void> {
  const { error } = await supabase
    .from("piece_costing_operations")
    .update(patch)
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
}

export async function deleteOperation(id: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from("piece_costing_operations")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// MATERIALS
// ----------------------------------------------------------------------------
export async function listMaterials(
  companyId: string,
  nomenclatureId: string,
): Promise<CostingMaterial[]> {
  const { data, error } = await supabase
    .from("piece_costing_materials")
    .select("*")
    .eq("company_id", companyId)
    .eq("nomenclature_id", nomenclatureId)
    .order("sequence_order");
  if (error) throw error;
  return (data as CostingMaterial[]) ?? [];
}

export async function listMaterialsForPiece(
  companyId: string,
  pieceTaskId: string,
): Promise<CostingMaterial[]> {
  const { data, error } = await supabase
    .from("piece_costing_materials")
    .select("*")
    .eq("company_id", companyId)
    .eq("piece_task_id", pieceTaskId)
    .order("sequence_order");
  if (error) throw error;
  return (data as CostingMaterial[]) ?? [];
}

export async function createMaterial(
  input: Omit<CostingMaterial, "id" | "subtotal" | "created_at" | "updated_at">,
): Promise<CostingMaterial> {
  const { data, error } = await supabase
    .from("piece_costing_materials")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as CostingMaterial;
}

export async function updateMaterial(
  id: string,
  companyId: string,
  patch: Partial<Pick<CostingMaterial,
    | "material_name" | "material_code"
    | "calculation_mode" | "mass_volumique"
    | "diameter" | "length" | "width" | "thickness"
    | "quantity_pieces" | "quantity" | "unit"
    | "unit_price" | "price_per_kg" | "material_total"
    | "notes" | "sequence_order">>,
): Promise<void> {
  const { error } = await supabase
    .from("piece_costing_materials")
    .update(patch)
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
}

export async function deleteMaterial(id: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from("piece_costing_materials")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// PRIX MATIÈRES (par entreprise)
// ----------------------------------------------------------------------------
export interface MaterialPrice {
  id: string;
  company_id: string;
  material_id: string;
  price_per_kg: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function listMaterialPrices(
  companyId: string,
): Promise<MaterialPrice[]> {
  const { data, error } = await supabase
    .from("material_prices")
    .select("*")
    .eq("company_id", companyId);
  if (error) throw error;
  return (data as MaterialPrice[]) ?? [];
}

export async function upsertMaterialPrice(
  companyId: string,
  materialId: string,
  pricePerKg: number,
  currency = "TND",
): Promise<void> {
  const { error } = await supabase
    .from("material_prices")
    .upsert(
      {
        company_id: companyId,
        material_id: materialId,
        price_per_kg: pricePerKg,
        currency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,material_id" },
    );
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
export interface CostingSummary {
  nomenclature_id: string;
  saved_total: number | null;
  total_operations: number;
  total_materials: number;
  live_total: number;
  cnc_hours: number;
  cnc_cost: number;
}

export async function fetchSummary(
  companyId: string,
  nomenclatureId: string,
): Promise<CostingSummary | null> {
  const { data, error } = await supabase
    .from("v_piece_costing_summary")
    .select("*")
    .eq("company_id", companyId)
    .eq("nomenclature_id", nomenclatureId)
    .maybeSingle();
  if (error) throw error;
  return data as CostingSummary | null;
}