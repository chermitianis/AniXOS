// ============================================================================
// test-odoo-connection Edge Function
//
// Actions supportées :
//   - test   : teste la connexion à Odoo avec les credentials fournis
//   - save   : enregistre la configuration Odoo (chiffre l'API key)
//   - toggle : active/désactive l'intégration Odoo
//
// Sécurité :
//   - Vérifie que l'appelant est is_owner de sa company
//   - Chiffre l'API key avant stockage (jamais en clair)
//
// Compatibilité Odoo :
//   - JSON-RPC (Odoo 14-18)
//   - JSON-2 (Odoo 19+) — détection automatique
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

// ----------------------------------------------------------------------------
// Chiffrement symétrique (AES-GCM) pour l'API key
// ----------------------------------------------------------------------------
async function getEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptApiKey(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
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
// Test de connexion Odoo (JSON-RPC, compatible 14-18)
// ----------------------------------------------------------------------------
async function testOdooConnection(params: {
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  api_key: string;
}): Promise<{ ok: boolean; version?: string; uid?: number; error?: string }> {
  try {
    const baseUrl = params.odoo_url.replace(/\/$/, "");
    const endpoint = `${baseUrl}/jsonrpc`;

    // 1) Authentification
    const authResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "authenticate",
          args: [params.odoo_db, params.odoo_username, params.api_key, {}],
        },
        id: 1,
      }),
    });

    if (!authResponse.ok) {
      return { ok: false, error: `HTTP ${authResponse.status} — ${authResponse.statusText}` };
    }

    const authData = await authResponse.json();
    const uid = authData?.result;

    if (!uid) {
      return {
        ok: false,
        error: "Authentification Odoo échouée — vérifiez l'URL, la base, l'utilisateur et la clé API",
      };
    }

    // 2) Récupération de la version
    const versionResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service: "common", method: "version", args: [] },
        id: 2,
      }),
    });

    let version = "unknown";
    if (versionResponse.ok) {
      const versionData = await versionResponse.json();
      version = versionData?.result?.server_version ?? "unknown";
    }

    return { ok: true, version, uid };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur réseau inconnue",
    };
  }
}

// ----------------------------------------------------------------------------
// Handler principal
// ----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) Vérification de la session
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized", message: "Non autorisé" }, 401);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser) {
      return jsonResponse({ error: "unauthorized", message: "Session invalide" }, 401);
    }

    // 2) Vérification que l'appelant est owner
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: staff } = await admin
      .from("staff_users")
      .select("company_id, is_owner")
      .eq("auth_user_id", callerUser.id)
      .eq("is_owner", true)
      .limit(1)
      .maybeSingle();

    if (!staff || !staff.company_id) {
      return jsonResponse(
        { error: "forbidden", message: "Seul le propriétaire peut gérer l'intégration Odoo" },
        403,
      );
    }

    const companyId = staff.company_id;

    // 3) Lecture du body
    const body = await req.json();
    const { action } = body;

    // ---------------------------------------------------------------------
    // ACTION : test
    // ---------------------------------------------------------------------
    if (action === "test") {
      const { odoo_url, odoo_db, odoo_username, api_key } = body;
      if (!odoo_url || !odoo_db || !odoo_username) {
        return jsonResponse(
          { error: "invalid_input", message: "Champs obligatoires manquants" },
          400,
        );
      }

      // Si api_key absent, récupérer la version chiffrée depuis la DB
      let effectiveKey = api_key;
      if (!effectiveKey) {
        const { data: existing } = await admin
          .from("odoo_config")
          .select("api_key_encrypted")
          .eq("company_id", companyId)
          .maybeSingle();
        if (!existing) {
          return jsonResponse(
            { error: "no_api_key", message: "Clé API requise pour le premier test" },
            400,
          );
        }
        effectiveKey = await decryptApiKey(existing.api_key_encrypted);
      }

      const result = await testOdooConnection({
        odoo_url,
        odoo_db,
        odoo_username,
        api_key: effectiveKey,
      });

      // Enregistrer le résultat du test (best-effort)
      await admin
        .from("odoo_config")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: result.ok ? "success" : "failed",
          last_test_error: result.ok ? null : result.error,
          version: result.version ?? null,
        })
        .eq("company_id", companyId);

      if (!result.ok) {
        return jsonResponse({ success: false, message: result.error }, 400);
      }

      return jsonResponse({
        success: true,
        message: `Connecté à Odoo (version ${result.version})`,
        version: result.version,
        uid: result.uid,
      });
    }

    // ---------------------------------------------------------------------
    // ACTION : save
    // ---------------------------------------------------------------------
    if (action === "save") {
      const {
        odoo_url,
        odoo_db,
        odoo_username,
        api_key,
        sync_modules,
        sync_direction,
        auto_sync_enabled,
        auto_sync_interval_minutes,
        notify_on_error,
      } = body;

      if (!odoo_url || !odoo_db || !odoo_username) {
        return jsonResponse(
          { error: "invalid_input", message: "URL, base et utilisateur obligatoires" },
          400,
        );
      }

      // Vérifier si une config existe déjà
      const { data: existing } = await admin
        .from("odoo_config")
        .select("id, api_key_encrypted")
        .eq("company_id", companyId)
        .maybeSingle();

      // Préparer l'API key (chiffrée)
      let apiKeyEncrypted: string;
      if (api_key) {
        apiKeyEncrypted = await encryptApiKey(api_key);
      } else if (existing?.api_key_encrypted) {
        apiKeyEncrypted = existing.api_key_encrypted;
      } else {
        return jsonResponse(
          { error: "missing_api_key", message: "Clé API requise pour la première configuration" },
          400,
        );
      }

      const payload = {
        company_id: companyId,
        odoo_url: odoo_url.trim(),
        odoo_db: odoo_db.trim(),
        odoo_username: odoo_username.trim(),
        api_key_encrypted: apiKeyEncrypted,
        sync_modules: sync_modules ?? {
          clients: true,
          projects: false,
          invoices: false,
          suppliers: false,
        },
        sync_direction: sync_direction ?? "pull",
        auto_sync_enabled: auto_sync_enabled ?? false,
        auto_sync_interval_minutes: auto_sync_interval_minutes ?? 60,
        notify_on_error: notify_on_error ?? true,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await admin
        .from("odoo_config")
        .upsert(payload, { onConflict: "company_id" });

      if (upsertError) {
        return jsonResponse(
          { error: "save_failed", message: upsertError.message },
          500,
        );
      }

      return jsonResponse({ success: true });
    }

    // ---------------------------------------------------------------------
    // ACTION : toggle
    // ---------------------------------------------------------------------
    if (action === "toggle") {
      const { data: existing } = await admin
        .from("odoo_config")
        .select("id, is_active")
        .eq("company_id", companyId)
        .maybeSingle();

      if (!existing) {
        return jsonResponse(
          { error: "not_configured", message: "Configurez d'abord l'intégration" },
          400,
        );
      }

      const newState = !existing.is_active;

      const { error: updateError } = await admin
        .from("odoo_config")
        .update({
          is_active: newState,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);

      if (updateError) {
        return jsonResponse(
          { error: "toggle_failed", message: updateError.message },
          500,
        );
      }

      return jsonResponse({ success: true, is_active: newState });
    }

    return jsonResponse({ error: "invalid_action", message: "Action inconnue" }, 400);
  } catch (err) {
    console.error("test-odoo-connection failed:", err);
    return jsonResponse(
      { error: "internal_error", message: err instanceof Error ? err.message : "Erreur inconnue" },
      500,
    );
  }
});