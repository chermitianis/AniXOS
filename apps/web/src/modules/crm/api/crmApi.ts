// ============================================================================
// crmApi — helpers Supabase pour le module CRM
// ============================================================================

import { supabase } from "../../../lib/supabaseClient";

export type ProspectStage =
  | "nouveau"
  | "contacte"
  | "negociation"
  | "gagne"
  | "perdu";

export interface Prospect {
  id: string;
  company_id: string;
  full_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  stage: ProspectStage;
  estimated_value: number | null;
  probability: number | null;
  expected_close_at: string | null;
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