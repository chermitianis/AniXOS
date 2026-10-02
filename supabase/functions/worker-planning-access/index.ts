// ============================================================================
// worker-planning-access Edge Function
//
// Mission 1 — PWA Planning opérateur (/planning).
//
// Point d'entrée PUBLIC (aucun header Authorization Supabase attendu) : les
// téléphones des opérateurs n'ont jamais de compte auth.users. L'accès est
// gouverné par DEUX facteurs (2FA léger) :
//   1. Le "token" scanné (company_id + secret) — chose que possède l'entreprise.
//   2. Un PIN à 4 chiffres propre à l'opérateur — chose qu'il connaît.
// Le PIN est vérifié uniquement à l'action "verify" (après un scan) ;
// les actions suivantes ("fetch") ne requièrent que le token, puisque la
// session est conservée en localStorage côté client.
//
// Actions :
//   - "verify" : { action, company_id, secret, pin }
//                → vérifie token + PIN, retourne les infos de la company
//                  et de l'opérateur (nom, interface).
//   - "fetch"  : { action, company_id, secret, date }
//                → retourne le planning machines d'une date (lecture seule).
//
// Régénérer le QR côté propriétaire révoque instantanément tous les
// téléphones connectés.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

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
      return false;
    }
  }

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

/**
 * Vérifie le PIN (4 chiffres) contre `workers.pin_code_hash` pour un
 * opérateur actif de la company donnée.
 * - Si aucun opérateur n'a ce PIN → invalid_pin.
 * - Si le PIN est null pour tous → pin_not_set.
 */
async function verifyPin(
  companyId: string,
  pin: string,
): Promise<
  | { ok: true; workerId: string; workerName: string; interfaceType: string }
  | { ok: false; error: "invalid_pin" | "pin_not_set" }
> {
  if (!pin || !/^\d{4}$/.test(pin)) return { ok: false, error: "invalid_pin" };

  const { data: workers } = await admin
    .from("workers")
    .select("id, full_name, interface_type, pin_code_hash")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const list = (workers ?? []) as Array<{
    id: string;
    full_name: string;
    interface_type: string | null;
    pin_code_hash: string | null;
  }>;

  if (list.length === 0) return { ok: false, error: "invalid_pin" };

  // Si aucun n'a de pin_hash, on informe explicitement.
  const hashes = list.filter((w) => w.pin_code_hash);
  if (hashes.length === 0) return { ok: false, error: "pin_not_set" };

  for (const w of list) {
    const hash = w.pin_code_hash;
    if (!hash) continue;
    let normalized = hash.trim();
    if (normalized.startsWith("$2y$") || normalized.startsWith("$2b$")) {
      normalized = "$2a$" + normalized.slice(4);
    }
    try {
      const match = await bcrypt.compare(pin, normalized);
      if (match) {
        return {
          ok: true,
          workerId: w.id,
          workerName: w.full_name,
          interfaceType: w.interface_type || "both",
        };
      }
    } catch {
      continue;
    }
  }

  return { ok: false, error: "invalid_pin" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, company_id, secret, date, pin } = body ?? {};

    if (!action || !company_id || !secret) {
      return jsonResponse({ success: false, error: "invalid_input" }, 400);
    }

    const check = await verifyToken(String(company_id), String(secret));
    if (!check.ok) {
      return jsonResponse({ success: false, error: check.error }, 401);
    }

    if (action === "verify") {
      // 2FA : on exige le PIN ici uniquement.
      const pinCheck = await verifyPin(String(company_id), String(pin ?? ""));
      if (!pinCheck.ok) {
        return jsonResponse({ success: false, error: pinCheck.error }, 401);
      }

      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", company_id)
        .maybeSingle();

      return jsonResponse({
        success: true,
        company_name: company?.name ?? "",
        worker_id: pinCheck.workerId,
        worker_name: pinCheck.workerName,
        interface_type: pinCheck.interfaceType,
      });
    }

    if (action === "fetch") {
      const targetDate =
        typeof date === "string" && date.length > 0 ? date : new Date().toISOString().slice(0, 10);

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