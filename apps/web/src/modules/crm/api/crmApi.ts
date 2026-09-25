// ============================================================================
// crmApi — helpers Supabase pour le module CRM
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";

// Pipeline complet : Nouveau → Qualification → Étude → Chiffrage →
// Offre → Négociation → Gagné/Perdu
export type ProspectStage =
  | "nouveau"
  | "qualification"
  | "etude"
  | "chiffrage"
  | "offre"
  | "negociation"
  | "gagne"
  | "perdu";

export type ProspectPriority = "basse" | "normale" | "haute" | "urgente";

export interface Prospect {
  id: string;
  company_id: string;
  full_name: string;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  stage: ProspectStage;
  priority: ProspectPriority;
  estimated_value: number | null;
  probability: number | null;
  expected_close_at: string | null;
  requested_date: string | null;
  owner_staff_id: string | null;
  converted_at: string | null;
  converted_client_id: string | null;
  created_at: string;
  updated_at: string;
}

export type InteractionType = "appel" | "email" | "rdv" | "note";

export interface Interaction {
  id: string;
  company_id: string;
  prospect_id: string;
  type: InteractionType;
  summary: string;
  happened_at: string;
  author_staff_id: string | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// PROSPECTS
// ----------------------------------------------------------------------------

export async function listProspects(): Promise<Prospect[]> {
  const { data, error } = await supabase
    .from("crm_prospects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as Prospect[]) ?? [];
}

export async function createProspect(
  input: Omit<Prospect, "id" | "company_id" | "created_at" | "updated_at" | "converted_at" | "converted_client_id">,
  companyId: string,
): Promise<Prospect> {
  const { data, error } = await supabase
    .from("crm_prospects")
    .insert({ ...input, company_id: companyId })
    .select()
    .single();

  if (error) throw error;
  return data as Prospect;
}

export async function updateProspect(
  id: string,
  patch: Partial<Prospect>,
): Promise<void> {
  const { error } = await supabase
    .from("crm_prospects")
    .update(patch)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteProspect(id: string): Promise<void> {
  const { error } = await supabase
    .from("crm_prospects")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ----------------------------------------------------------------------------
// INTERACTIONS
// ----------------------------------------------------------------------------

export async function listInteractions(prospectId: string): Promise<Interaction[]> {
  const { data, error } = await supabase
    .from("crm_interactions")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("happened_at", { ascending: false });

  if (error) throw error;
  return (data as Interaction[]) ?? [];
}

export async function createInteraction(
  input: Omit<Interaction, "id" | "company_id" | "created_at">,
  companyId: string,
): Promise<Interaction> {
  const { data, error } = await supabase
    .from("crm_interactions")
    .insert({ ...input, company_id: companyId })
    .select()
    .single();

  if (error) throw error;
  return data as Interaction;
}

// ----------------------------------------------------------------------------
// CONVERSION PROSPECT → CLIENT
// ----------------------------------------------------------------------------

export async function convertProspectToClient(
  prospect: Prospect,
  companyId: string,
): Promise<{ clientId: string }> {
  // 1) Créer le client
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      company_id: companyId,
      name: prospect.company_name ?? prospect.full_name,
      email: prospect.email,
      phone: prospect.phone,
    })
    .select("id")
    .single();

  if (clientError) throw clientError;
  const clientId = (client as { id: string }).id;

  // 2) Marquer le prospect comme converti
  const { error: updateError } = await supabase
    .from("crm_prospects")
    .update({
      stage: "gagne",
      converted_at: new Date().toISOString(),
      converted_client_id: clientId,
    })
    .eq("id", prospect.id);

  if (updateError) throw updateError;

  return { clientId };
}

// ----------------------------------------------------------------------------
// PONT CRM → INGÉNIERIE : Opportunité Gagnée → Project
//
// Le projet démarre en 'draft' — il entre automatiquement dans le workflow
// Ingénierie (visible dans "Projets à étudier"). Le code (PRJ-YYYY-NNNN) est
// généré par le trigger 0077. Toutes les informations viennent du prospect.
//
// GARDE-FOU : si un projet existe déjà pour cette opportunité, on le retourne
// au lieu d'en créer un second (protection contre le double-clic).
// ----------------------------------------------------------------------------

export async function createProjectFromProspect(
  prospect: Prospect,
  companyId: string,
): Promise<{ projectId: string; clientId: string; projectCode: string }> {
  // GARDE-FOU anti-doublon
  const { data: existing } = await supabase
    .from("projects")
    .select("id, code, client_id")
    .eq("opportunity_id", prospect.id)
    .maybeSingle();

  if (existing) {
    const ex = existing as { id: string; code: string | null; client_id: string | null };
    return {
      projectId: ex.id,
      clientId: ex.client_id ?? prospect.converted_client_id ?? "",
      projectCode: ex.code ?? "—",
    };
  }

  // Créer le client si nécessaire
  let clientId = prospect.converted_client_id;

  if (!clientId) {
    const { clientId: newClientId } = await convertProspectToClient(prospect, companyId);
    clientId = newClientId;
  } else if (prospect.stage !== "gagne") {
    await supabase
      .from("crm_prospects")
      .update({
        stage: "gagne",
        converted_at: prospect.converted_at ?? new Date().toISOString(),
      })
      .eq("id", prospect.id);
  }

  // Créer le projet
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      company_id: companyId,
      client_id: clientId,
      opportunity_id: prospect.id,
      name: prospect.company_name ?? prospect.full_name,
      code: null,
      description: prospect.notes,
      quoted_price: prospect.estimated_value,
      estimated_cost: null,
      due_date: prospect.requested_date,
      status: "draft",
    })
    .select("id, code")
    .single();

  if (error) {
    if (error.message.includes("duplicate")) {
      throw new Error("Un projet similaire existe déjà pour cette opportunité.");
    }
    throw error;
  }

  const created = project as { id: string; code: string | null };
  return {
    projectId: created.id,
    clientId,
    projectCode: created.code ?? "—",
  };
}