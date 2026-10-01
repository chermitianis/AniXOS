// ============================================================================
// manufacturingOrdersApi — CRUD + logique métier des ordres de fabrication
//
// Responsabilités :
//   - Créer un OF à partir d'une pièce (copie des opérations de costing,
//     création automatique des work packages par interface).
//   - Lire un OF avec ses opérations et ses work packages.
//   - Mettre à jour les infos du dessin technique.
//   - Marquer l'OF "prêt à planifier".
//   - Lister les OF par statut / par pièce / par projet.
//
// RÈGLE DE SÉCURITÉ (C5) : company_id explicite sur TOUTES les requêtes.
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";
import {
  generateOfNumber,
  stageToInterface,
  groupOperationsByInterface,
  type OfInterface,
} from "../../../shared/utils/of";
import type {
  ManufacturingOrder,
  OfOperation,
  OfWorkPackage,
  ManufacturingOrderStatus,
  OfWorkPackageStatus,
} from "../../../shared/types/database";

// ---------------------------------------------------------------------------
// Types enrichis
// ---------------------------------------------------------------------------
export interface OfWithRelations extends ManufacturingOrder {
  operations: OfOperation[];
  work_packages: OfWorkPackage[];
}

export interface CreateOfResult {
  of: ManufacturingOrder;
  operations: OfOperation[];
  work_packages: OfWorkPackage[];
}

// ---------------------------------------------------------------------------
// CREATE — Créer un OF à partir d'une pièce
//
// Étapes :
//   1. Vérifier qu'aucun OF n'existe déjà pour cette pièce.
//   2. Générer le numéro d'OF (SQL atomique).
//   3. Insérer l'OF.
//   4. Copier les opérations de costing → of_operations (avec interface_type).
//   5. Créer les work packages (1 par interface présente).
//   6. Lier la pièce à l'OF + passer son production_status.
// ---------------------------------------------------------------------------
export async function createOfFromPiece(params: {
    companyId: string;
    staffId: string;
    pieceTaskId: string;
    projectId: string;
    productName: string;
    quantity: number;
    interfaceType?: OfInterface | null;
  }): Promise<CreateOfResult> {
    const { companyId, staffId, pieceTaskId, projectId, productName, quantity } = params;
  
    // 1. Vérifier qu'aucun OF n'existe pour cette pièce
    const { data: existing, error: checkErr } = await supabase
      .from("manufacturing_orders")
      .select("id")
      .eq("company_id", companyId)
      .eq("piece_task_id", pieceTaskId)
      .maybeSingle();
  
    if (checkErr) throw checkErr;
    if (existing) {
      throw new Error("Un ordre de fabrication existe déjà pour cette pièce.");
    }
  
    // 2. Générer le numéro d'OF (avec projectId pour code client)
    const ofNumber = await generateOfNumber(companyId, projectId);
  
    // 3. Insérer l'OF
    const { data: insertedOf, error: ofErr } = await supabase
      .from("manufacturing_orders")
      .insert({
        company_id: companyId,
        project_id: projectId,
        piece_task_id: pieceTaskId,
        order_number: ofNumber,
        product_name: productName,
        quantity,
        status: "preparing",
        interface_type: params.interfaceType ?? null,
        created_by: staffId,
      } as never)
      .select()
      .single();
  
    if (ofErr || !insertedOf) throw ofErr ?? new Error("Échec création OF.");
    const of = insertedOf as ManufacturingOrder;
  
    // 4. Copier les opérations de costing → of_operations
    //    Inclut quantity_pieces, unit_price, stt_type pour STT / Anodisation
    const { data: costingOps, error: costingErr } = await supabase
      .from("piece_costing_operations")
      .select("stage, label, estimated_hours, hourly_rate, quantity_pieces, unit_price, stt_type, subtotal, sequence_order")
      .eq("company_id", companyId)
      .eq("piece_task_id", pieceTaskId)
      .order("sequence_order");
  
    if (costingErr) throw costingErr;
  
    const operationsPayload = (costingOps ?? []).map((op) => {
      const row = op as {
        stage: string;
        label: string | null;
        estimated_hours: number;
        hourly_rate: number;
        quantity_pieces: number | null;
        unit_price: number | null;
        stt_type: string | null;
        subtotal: number | null;
        sequence_order: number;
      };
      return {
        company_id: companyId,
        manufacturing_order_id: of.id,
        stage: row.stage,
        label: row.label,
        estimated_hours: row.estimated_hours,
        hourly_rate: row.hourly_rate,
        quantity_pieces: row.quantity_pieces ?? 1,
        unit_price: row.unit_price,
        stt_type: row.stt_type,
        subtotal: Number(row.subtotal ?? 0),
        interface_type: stageToInterface(row.stage),
        sequence_order: row.sequence_order,
      };
    });
  
    let operations: OfOperation[] = [];
    if (operationsPayload.length > 0) {
      const { data: opsData, error: opsErr } = await supabase
        .from("of_operations")
        .insert(operationsPayload as never)
        .select();
      if (opsErr) throw opsErr;
      operations = (opsData as OfOperation[]) ?? [];
    }
  
    // 5. Créer les work packages (1 par interface présente)
    const grouped = groupOperationsByInterface(operations);
    const wpPayload: {
      company_id: string;
      manufacturing_order_id: string;
      interface_type: OfInterface;
      label: string;
      status: OfWorkPackageStatus;
    }[] = [];
  
    if (grouped.cnc.length > 0) {
      wpPayload.push({
        company_id: companyId,
        manufacturing_order_id: of.id,
        interface_type: "cnc",
        label: "Usinage CNC",
        status: "pending",
      });
    }
    if (grouped.classique.length > 0) {
      wpPayload.push({
        company_id: companyId,
        manufacturing_order_id: of.id,
        interface_type: "classique",
        label: "Opérations classiques",
        status: "pending",
      });
    }
  
    let workPackages: OfWorkPackage[] = [];
    if (wpPayload.length > 0) {
      const { data: wpData, error: wpErr } = await supabase
        .from("of_work_packages")
        .insert(wpPayload as never)
        .select();
      if (wpErr) throw wpErr;
      workPackages = (wpData as OfWorkPackage[]) ?? [];
    }
  
    // 6. Lier la pièce à l'OF + changer production_status
    const { error: pieceErr } = await supabase
      .from("pieces_tasks")
      .update({
        manufacturing_order_id: of.id,
        production_status: "in_preparation",
      } as never)
      .eq("id", pieceTaskId)
      .eq("company_id", companyId);
  
    if (pieceErr) throw pieceErr;
  
    return { of, operations, work_packages: workPackages };
  }

// ---------------------------------------------------------------------------
// READ — OF par ID, avec ses opérations et work packages
// ---------------------------------------------------------------------------
export async function getOfById(
  ofId: string,
  companyId: string,
): Promise<OfWithRelations | null> {
  const { data: of, error } = await supabase
    .from("manufacturing_orders")
    .select("*")
    .eq("id", ofId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  if (!of) return null;

  const [{ data: ops }, { data: wps }] = await Promise.all([
    supabase
      .from("of_operations")
      .select("*")
      .eq("manufacturing_order_id", ofId)
      .eq("company_id", companyId)
      .order("sequence_order"),
    supabase
      .from("of_work_packages")
      .select("*")
      .eq("manufacturing_order_id", ofId)
      .eq("company_id", companyId),
  ]);

  return {
    ...(of as ManufacturingOrder),
    operations: (ops as OfOperation[]) ?? [],
    work_packages: (wps as OfWorkPackage[]) ?? [],
  };
}

// ---------------------------------------------------------------------------
// READ — OF par piece_task_id
// ---------------------------------------------------------------------------
export async function getOfByPieceId(
  pieceTaskId: string,
  companyId: string,
): Promise<OfWithRelations | null> {
  const { data: of, error } = await supabase
    .from("manufacturing_orders")
    .select("*")
    .eq("piece_task_id", pieceTaskId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  if (!of) return null;

  return getOfById((of as ManufacturingOrder).id, companyId);
}

// ---------------------------------------------------------------------------
// READ — Liste des OF par statut
// ---------------------------------------------------------------------------
export async function listOfsByStatus(
  companyId: string,
  statuses: ManufacturingOrderStatus[],
): Promise<ManufacturingOrder[]> {
  const { data, error } = await supabase
    .from("manufacturing_orders")
    .select("*")
    .eq("company_id", companyId)
    .in("status", statuses)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as ManufacturingOrder[]) ?? [];
}

// ---------------------------------------------------------------------------
// READ — Liste des OF par projet
// ---------------------------------------------------------------------------
export async function listOfsByProject(
  companyId: string,
  projectId: string,
): Promise<ManufacturingOrder[]> {
  const { data, error } = await supabase
    .from("manufacturing_orders")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as ManufacturingOrder[]) ?? [];
}

// ---------------------------------------------------------------------------
// UPDATE — dessin technique (3 chemins possibles)
// ---------------------------------------------------------------------------
export async function updateOfDrawing(
  ofId: string,
  companyId: string,
  drawing: {
    url?: string | null;
    path_local?: string | null;
    path_network?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("manufacturing_orders")
    .update({
      technical_drawing_url: drawing.url ?? null,
      technical_drawing_path_local: drawing.path_local ?? null,
      technical_drawing_path_network: drawing.path_network ?? null,
    } as never)
    .eq("id", ofId)
    .eq("company_id", companyId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// UPDATE — notes libres sur l'OF
// ---------------------------------------------------------------------------
export async function updateOfNotes(
  ofId: string,
  companyId: string,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("manufacturing_orders")
    .update({ notes } as never)
    .eq("id", ofId)
    .eq("company_id", companyId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// UPDATE — Marquer l'OF "prêt à planifier"
//   Le statut passe de 'preparing' → 'ready'.
//   La pièce passe de 'in_preparation' → 'ready_to_start'.
// ---------------------------------------------------------------------------
export async function markOfReadyToPlan(
  ofId: string,
  companyId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();

  const { error: ofErr } = await supabase
    .from("manufacturing_orders")
    .update({
      status: "ready",
      prepared_at: nowIso,
    } as never)
    .eq("id", ofId)
    .eq("company_id", companyId);

  if (ofErr) throw ofErr;

  // Récupérer piece_task_id pour mettre à jour le production_status
  const { data: of } = await supabase
    .from("manufacturing_orders")
    .select("piece_task_id")
    .eq("id", ofId)
    .eq("company_id", companyId)
    .maybeSingle();

  const pieceTaskId = (of as { piece_task_id: string | null } | null)?.piece_task_id;
  if (pieceTaskId) {
    const { error: pieceErr } = await supabase
      .from("pieces_tasks")
      .update({ production_status: "ready_to_start" } as never)
      .eq("id", pieceTaskId)
      .eq("company_id", companyId);

    if (pieceErr) throw pieceErr;
  }
}

// ---------------------------------------------------------------------------
// UPDATE — Statut OF manuel (pour usage admin)
// ---------------------------------------------------------------------------
export async function updateOfStatus(
  ofId: string,
  companyId: string,
  status: ManufacturingOrderStatus,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "scheduled") patch.scheduled_at = new Date().toISOString();
  if (status === "in_progress") patch.started_at = new Date().toISOString();
  if (status === "completed") patch.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from("manufacturing_orders")
    .update(patch as never)
    .eq("id", ofId)
    .eq("company_id", companyId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// DELETE — Supprimer un OF (uniquement si 'draft'/'preparing')
// ---------------------------------------------------------------------------
export async function deleteOf(ofId: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from("manufacturing_orders")
    .delete()
    .eq("id", ofId)
    .eq("company_id", companyId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// READ — Vérifier l'existence d'un OF pour une pièce (garde-fou)
// ---------------------------------------------------------------------------
export async function ofExistsForPiece(
  pieceTaskId: string,
  companyId: string,
): Promise<{ id: string; order_number: string; status: string } | null> {
  const { data, error } = await supabase
    .from("manufacturing_orders")
    .select("id, order_number, status")
    .eq("piece_task_id", pieceTaskId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; order_number: string; status: string } | null;
}