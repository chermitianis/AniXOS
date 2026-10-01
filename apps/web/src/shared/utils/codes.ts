// ============================================================================
// codes — génération de codes (client / projet / pièce)
//
// RÈGLE : ces fonctions ne modifient JAMAIS le schéma. Elles calculent côté
// client, avec une vérification de comptage côté DB. Un UNIQUE constraint sur
// projects.code est recommandé à terme (voir note en fin de réponse).
// ============================================================================

import { supabase } from "../../lib/supabaseClient";

/**
 * Code client : séquentiel sur 2 chiffres par entreprise (01, 02, ..., 99).
 * Se base sur le max existant — robuste aux suppressions (ne recycle pas).
 */
export async function generateClientCode(companyId: string): Promise<string> {
  const { data } = await supabase
    .from("clients")
    .select("code")
    .eq("company_id", companyId)
    .not("code", "is", null)
    .order("code", { ascending: false })
    .limit(1);

  const last = (data?.[0] as { code: string | null } | undefined)?.code;
  const next = last ? parseInt(last, 10) + 1 : 1;
  return String(next).padStart(2, "0");
}

/**
 * Code projet : YYMMCCNN
 *   YY = année (2 chiffres)
 *   MM = mois   (2 chiffres)
 *   CC = code client (2 chiffres, "00" si aucun client)
 *   NN = numéro séquentiel du projet pour ce client ce mois-là (01, 02, ...)
 *
 * Exemple : 26100302 = oct. 2026, client 03, 2ᵉ projet du mois.
 */
export async function generateProjectCode(
    companyId: string,
    clientId: string | null,
  ): Promise<string> {
    if (!clientId) {
      throw new Error("Un client est requis pour générer un code projet.");
    }
    const { data, error } = await supabase.rpc("generate_project_code", {
      p_company_id: companyId,
      p_client_id: clientId,
    });
    if (error || !data) {
      throw new Error(error?.message ?? "Impossible de générer le code projet.");
    }
    return data as string;
  }

/**
 * Code pièce interne — préfixé par le code projet + séquence.
 * Non affiché à l'utilisateur (identifiant caché).
 */
export function generatePieceCode(projectCode: string, sequence: number): string {
  return `${projectCode}-P${String(sequence + 1).padStart(2, "0")}`;
}