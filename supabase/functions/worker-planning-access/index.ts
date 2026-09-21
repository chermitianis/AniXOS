// ============================================================================
// worker-planning-access Edge Function
//
// Mission 1 — PWA Planning opérateur (/planning).
//
// Point d'entrée PUBLIC (aucun header Authorization Supabase attendu) : les
// téléphones des opérateurs n'ont jamais de compte auth.users. L'accès est
// entièrement gouverné par le "token" scanné (company_id + secret), revalidé
// contre `planning_qr_codes` à CHAQUE appel — ainsi une régénération du QR
// par le propriétaire révoque instantanément tous les téléphones déjà
// connectés, sans avoir à gérer une liste de sessions à invalider.
//
// Actions :
//   - "verify" : confirme la validité du token juste après un scan, renvoie
//                le nom de l'entreprise (affiché une fois à l'opérateur).
//   - "fetch"  : renvoie le planning machines d'une date donnée (lecture
//                seule stricte — aucune écriture possible via cette route).
//
// Ce module est volontairement isolé de tout ce qui touche aux rapports/
// statistiques : il ne fait que projeter `v_machine_planning_overview`,
// exactement la même vue que celle utilisée par le bouton "Planning
// machines" du Kiosk.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Statut d'abonnement simplifié, en miroir de get_company_subscription_status()
 * (0059) — dupliqué ici car cette route s'exécute en service_role, sans
 * auth.uid() disponible pour appeler la RPC existante. */
async function isCompanyAllowed(companyId: string): Promise<boolean> {
  const { data: company } = await admin
    .from("companies")
    .select("is_developer_account, subscription_plan, trial_ends_at, account_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) return false;
  if (company.is_developer_account) return true;

  if (company.account_id) {
    const { data: account } = await admin
      .from("accounts")
      .select("is_developer, subscription_status, trial_ends_at")
      .eq("id", company.account_id)
      .maybeSingle();

    if (account) {
      if (account.is_developer) return true;
      if (account.subscription_status === "active") return true;
      if (account.subscription_status === "trial") {
        return account.trial_ends_at ? new Date(account.trial_ends_at) > new Date() : false;
      }
      return false; // suspended / cancelled / expired
    }
  }

  // Repli (sociétés non migrées vers `accounts`, comme get_company_subscription_status)
  if (company.subscription_plan === "active") return true;
  if (company.subscription_plan === "trial") {
    return company.trial_ends_at ? new Date(company.trial_ends_at) > new Date() : false;
  }
  return false;
}

async function verifyToken(companyId: string, secret: string): Promise<{ ok: boolean; error?: string }> {
  if (!companyId || !secret) return { ok: false, error: "invalid_token" };

  const { data: qr } = await admin
    .from("planning_qr_codes")
    .select("qr_secret")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!qr || qr.qr_secret !== secret) return { ok: false, error: "invalid_token" };

  const allowed = await isCompanyAllowed(companyId);
  if (!allowed) return { ok: false, error: "subscription_required" };

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, company_id, secret, date } = body ?? {};

    if (!action || !company_id || !secret) {
      return jsonResponse({ success: false, error: "invalid_input" }, 400);
    }

    const check = await verifyToken(String(company_id), String(secret));
    if (!check.ok) {
      return jsonResponse({ success: false, error: check.error }, 401);
    }

    if (action === "verify") {
      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", company_id)
        .maybeSingle();

      return jsonResponse({ success: true, company_name: company?.name ?? "" });
    }

    if (action === "fetch") {
      const targetDate = typeof date === "string" && date.length > 0 ? date : new Date().toISOString().slice(0, 10);

      const { data, error } = await admin
        .from("v_machine_planning_overview")
        .select("*")
        .eq("company_id", company_id)
        .eq("planned_date", targetDate)
        .order("machine_name");

      if (error) return jsonResponse({ success: false, error: "fetch_failed" }, 500);

      return jsonResponse({ success: true, rows: data ?? [], server_time: new Date().toISOString() });
    }

    return jsonResponse({ success: false, error: "unknown_action" }, 400);
  } catch (err) {
    return jsonResponse({ success: false, error: (err as Error).message }, 500);
  }
});
