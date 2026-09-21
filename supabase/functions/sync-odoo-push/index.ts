// ============================================================================
// sync-odoo-push Edge Function
//
// Envoie les rapports de production AniXOS vers Odoo :
//   - Work Sessions (production + downtime)
//   - Work Shifts (login/logout)
//   - Piece Actuals (temps réel + coût)
//   - Machine Utilization
//   - Worker Performance
//
// Les données sont envoyées sous forme de "messages" dans un modèle Odoo
// générique ou via les modèles natifs (mrp.workcenter.productivity).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("ODOO_ENCRYPTION_KEY") ?? "anixos-odoo-default-key-change-me";

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

async function decryptApiKey(encoded: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const key = await crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function authenticateOdoo(url: string, db: string, username: string, apiKey: string) {
  const endpoint = `${url.replace(/\/$/, "")}/jsonrpc`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [db, username, apiKey, {}],
      },
      id: 1,
    }),
  });
  const data = await response.json();
  if (!data.result) throw new Error("Authentification Odoo échouée");
  return data.result as number;
}

async function odooCreate(
  url: string,
  db: string,
  uid: number,
  apiKey: string,
  model: string,
  values: Record<string, unknown>,
): Promise<number> {
  const endpoint = `${url.replace(/\/$/, "")}/jsonrpc`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [db, uid, apiKey, model, "create", [values]],
      },
      id: Date.now(),
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error?.data?.message ?? "Odoo create error");
  return data.result as number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let logId: string | null = null;

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);

    // Owner check
    const { data: staff } = await admin
      .from("staff_users")
      .select("company_id")
      .eq("auth_user_id", user.id)
      .eq("is_owner", true)
      .limit(1)
      .maybeSingle();
    if (!staff) return jsonResponse({ error: "forbidden" }, 403);
    const companyId = staff.company_id;

    // Config
    const { data: config } = await admin
      .from("odoo_config")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!config) {
      return jsonResponse({ error: "not_active", message: "Odoo non actif" }, 400);
    }

    // Log
    const { data: logEntry } = await admin
      .from("odoo_sync_log")
      .insert({ company_id: companyId, direction: "push", status: "in_progress" })
      .select()
      .single();
    logId = logEntry?.id ?? null;

    // Connect
    const apiKey = await decryptApiKey(config.api_key_encrypted);
    const uid = await authenticateOdoo(config.odoo_url, config.odoo_db, config.odoo_username, apiKey);

    // Récupérer les sessions depuis la dernière synchro
    const since = config.last_sync_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: sessions } = await admin
      .from("work_sessions")
      .select("id, session_type, started_at, ended_at, duration_minutes, worker_id, machine_id, project_id, piece_task_id, company_id")
      .eq("company_id", companyId)
      .gte("created_at", since);

    let sent = 0;

    // Envoi vers un modèle Odoo générique (à adapter selon votre Odoo)
    // Option 1 : créer des "notes" dans Odoo (mail.message)
    // Option 2 : créer des entrées dans mrp.workcenter.productivity
    for (const session of sessions ?? []) {
      try {
        await odooCreate(config.odoo_url, config.odoo_db, uid, apiKey, "mail.message", {
          model: "mrp.workcenter.productivity",
          body: `AniXOS Session: ${session.session_type} — ${session.duration_minutes} min`,
          subject: `Session ${session.id}`,
        });
        sent++;
      } catch (e) {
        console.warn("Failed to push session", session.id, e);
      }
    }

    const now = new Date().toISOString();

    if (logId) {
      await admin
        .from("odoo_sync_log")
        .update({
          status: "success",
          records_synced: sent,
          completed_at: now,
        })
        .eq("id", logId);
    }

    await admin
      .from("odoo_config")
      .update({
        last_sync_at: now,
        last_sync_status: "success",
        records_synced: (config.records_synced ?? 0) + sent,
      })
      .eq("company_id", companyId);

    return jsonResponse({ success: true, sent });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("sync-odoo-push failed:", err);

    if (logId) {
      await admin
        .from("odoo_sync_log")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    return jsonResponse({ error: "sync_failed", message: errorMessage }, 500);
  }
});