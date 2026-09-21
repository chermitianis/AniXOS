// ============================================================================
// costingApi — CRUD pour opérations + matières de chiffrage
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";
import type { CostingStage, MaterialUnit } from "../lib/costingConstants";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
export interface CostingOperation {
  id: string;
  company_id: string;
  nomenclature_id: string;
  piece_task_id: string | null;
  stage: CostingStage;
  label: string | null;
  estimated_hours: number;
  hourly_rate: number;
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
  quantity: number;
  unit: MaterialUnit;
  unit_price: number;
  subtotal: number;
  notes: string | null;
  sequence_order: number;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// OPERATIONS
// ----------------------------------------------------------------------------
export async function listOperations(nomenclatureId: string): Promise<CostingOperation[]> {
  const { data, error } = await supabase
    .from("piece_costing_operations")
    .select("*")
    .eq("nomenclature_id", nomenclatureId)
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
  patch: Partial<Pick<CostingOperation, "stage" | "label" | "estimated_hours" | "hourly_rate" | "notes">>,
): Promise<void> {
  const { error } = await supabase.from("piece_costing_operations").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOperation(id: string): Promise<void> {
  const { error } = await supabase.from("piece_costing_operations").delete().eq("id", id);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// MATERIALS
// ----------------------------------------------------------------------------
export async function listMaterials(nomenclatureId: string): Promise<CostingMaterial[]> {
  const { data, error } = await supabase
    .from("piece_costing_materials")
    .select("*")
    .eq("nomenclature_id", nomenclatureId)
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
  patch: Partial<Pick<CostingMaterial, "material_name" | "material_code" | "quantity" | "unit" | "unit_price" | "notes">>,
): Promise<void> {
  const { error } = await supabase.from("piece_costing_materials").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from("piece_costing_materials").delete().eq("id", id);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// SUMMARY (via vue SQL)
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

export async function fetchSummary(nomenclatureId: string): Promise<CostingSummary | null> {
  const { data, error } = await supabase
    .from("v_piece_costing_summary")
    .select("*")
    .eq("nomenclature_id", nomenclatureId)
    .maybeSingle();
  if (error) throw error;
  return data as CostingSummary | null;
}