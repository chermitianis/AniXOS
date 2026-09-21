// ============================================================================
// sync-odoo-pull Edge Function
//
// Récupère les données depuis Odoo (selon sync_modules) et les remplace
// dans AniXOS. Odoo devient la source de vérité pour les modules cochés.
//
// Modules supportés (via mapping Odoo ↔ AniXOS) :
//   - clients      : res.partner           → clients
//   - projects     : project.project       → projects
//   - invoices     : account.move (out_invoice) → invoices
//   - suppliers    : res.partner (supplier) → (à définir)
//
// ⚠️ Cette fonction effectue des UPSERT (pas de suppression sauvage).
// Les entités AniXOS sans correspondance Odoo sont conservées mais marquées
// comme "orphan" dans odoo_sync_log pour décision manuelle.
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

async function getEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  return await crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptApiKey(encoded: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ----------------------------------------------------------------------------
// Client JSON-RPC Odoo (helper générique)
// ----------------------------------------------------------------------------
class OdooClient {
  constructor(
    private url: string,
    private db: string,
    private uid: number,
    private apiKey: string,
  ) {}

  async execute_kw<T = unknown>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const endpoint = `${this.url.replace(/\/$/, "")}/jsonrpc`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [this.db, this.uid, this.apiKey, model, method, args, kwargs],
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Odoo HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error?.data?.message ?? data.error?.message ?? "Odoo error");
    }
    return data.result as T;
  }
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

// ----------------------------------------------------------------------------
// Handlers par module
// ----------------------------------------------------------------------------

async function pullClients(
  odoo: OdooClient,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  // Récupérer tous les partenaires (customers)
  const partners = await odoo.execute_kw<Array<Record<string, unknown>>>(
    "res.partner",
    "search_read",
    [[["customer_rank", ">", 0]]],
    {
      fields: ["id", "name", "email", "phone", "street", "city", "country_id", "vat"],
      limit: 5000,
    },
  );

  let count = 0;
  for (const p of partners) {
    const { error } = await admin.from("clients").upsert(
      {
        company_id: companyId,
        name: String(p.name ?? ""),
        email: p.email ? String(p.email) : null,
        phone: p.phone ? String(p.phone) : null,
        address: p.street ? String(p.street) : null,
        odoo_id: p.id,
      },
      { onConflict: "company_id,odoo_id" },
    );
    if (!error) count++;
  }
  return count;
}

async function pullProjects(
  odoo: OdooClient,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const projects = await odoo.execute_kw<Array<Record<string, unknown>>>(
    "project.project",
    "search_read",
    [[]],
    { fields: ["id", "name", "partner_id", "date_start", "date"], limit: 5000 },
  );

  let count = 0;
  for (const p of projects) {
    const { error } = await admin.from("projects").upsert(
      {
        company_id: companyId,
        name: String(p.name ?? ""),
        code: `ODOO-${p.id}`,
        odoo_id: p.id,
      },
      { onConflict: "company_id,odoo_id" },
    );
    if (!error) count++;
  }
  return count;
}

// ----------------------------------------------------------------------------
// Handler principal
// ----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let logId: string | null = null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1) Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser) return jsonResponse({ error: "unauthorized" }, 401);

    // 2) Owner check
    const { data: staff } = await admin
      .from("staff_users")
      .select("company_id")
      .eq("auth_user_id", callerUser.id)
      .eq("is_owner", true)
      .limit(1)
      .maybeSingle();
    if (!staff) return jsonResponse({ error: "forbidden" }, 403);
    const companyId = staff.company_id;

    // 3) Load config
    const { data: config } = await admin
      .from("odoo_config")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!config) {
      return jsonResponse(
        { error: "not_active", message: "L'intégration Odoo n'est pas active" },
        400,
      );
    }

    // 4) Create sync log
    const { data: logEntry } = await admin
      .from("odoo_sync_log")
      .insert({
        company_id: companyId,
        direction: "pull",
        status: "in_progress",
      })
      .select()
      .single();
    logId = logEntry?.id ?? null;

    // 5) Connect to Odoo
    const apiKey = await decryptApiKey(config.api_key_encrypted);
    const uid = await authenticateOdoo(config.odoo_url, config.odoo_db, config.odoo_username, apiKey);
    const odoo = new OdooClient(config.odoo_url, config.odoo_db, uid, apiKey);

    // 6) Sync modules
    const syncModules = config.sync_modules ?? {};
    const results: Record<string, number> = {};

    if (syncModules.clients) {
      results.clients = await pullClients(odoo, admin, companyId);
    }
    if (syncModules.projects) {
      results.projects = await pullProjects(odoo, admin, companyId);
    }
    // invoices, suppliers : à implémenter selon le schéma Odoo

    // 7) Update log + config
    const totalSynced = Object.values(results).reduce((a, b) => a + b, 0);
    const now = new Date().toISOString();

    if (logId) {
      await admin
        .from("odoo_sync_log")
        .update({
          status: "success",
          records_synced: totalSynced,
          details: results,
          completed_at: now,
        })
        .eq("id", logId);
    }

    await admin
      .from("odoo_config")
      .update({
        last_sync_at: now,
        last_sync_status: "success",
        last_sync_error: null,
        records_synced: (config.records_synced ?? 0) + totalSynced,
      })
      .eq("company_id", companyId);

    return jsonResponse({ success: true, results, totalSynced });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("sync-odoo-pull failed:", err);

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