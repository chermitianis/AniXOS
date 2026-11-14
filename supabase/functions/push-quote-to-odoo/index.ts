// ============================================================================
// push-quote-to-odoo Edge Function
//
// Pousse un devis AniXOS vers Odoo (crée un sale.order)
// Utilisé quand Odoo est actif et que l'utilisateur veut synchroniser.
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

async function odooExecute<T = unknown>(
  ctx: { url: string; db: string; uid: number; apiKey: string },
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const endpoint = `${ctx.url.replace(/\/$/, "")}/jsonrpc`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ctx.db, ctx.uid, ctx.apiKey, model, method, args, kwargs],
    },
    id: Date.now(),
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) throw new Error(`Odoo HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error?.data?.message ?? data.error?.message ?? "Odoo error");
  return data.result as T;
}

async function authenticateOdoo(url: string, db: string, username: string, apiKey: string): Promise<number> {
  const response = await fetch(`${url.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service: "common", method: "authenticate", args: [db, username, apiKey, {}] },
      id: 1,
    }),
  });

  if (!response.ok) throw new Error(`Odoo HTTP ${response.status}`);
  const data = await response.json();
  if (!data.result) throw new Error("Authentification Odoo échouée");
  return data.result as number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const { quote_id, project_name } = await req.json();
    if (!quote_id) {
      return jsonResponse({ error: "missing_quote_id" }, 400);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: companyId, error: companyError } = await callerClient.rpc("get_my_company_id");
    if (companyError || !companyId) {
      return jsonResponse({ error: "unauthorized" }, 403);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ✅ 1. التحقق من Odoo
    const { data: config } = await adminClient
      .from("odoo_config")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!config) {
      return jsonResponse({ error: "odoo_not_active", message: "Odoo n'est pas activé" }, 400);
    }

    const cfg = config as Record<string, unknown>;
    const apiKey = await decryptApiKey(cfg.api_key_encrypted as string);
    const uid = await authenticateOdoo(cfg.odoo_url as string, cfg.odoo_db as string, cfg.odoo_username as string, apiKey);
    const ctx = { url: cfg.odoo_url as string, db: cfg.odoo_db as string, uid, apiKey };

    // 2. جلب الـ Devis
    const { data: quote } = await adminClient
      .from("quotes")
      .select("*, quote_items(*), clients(odoo_id)")
      .eq("id", quote_id)
      .eq("company_id", companyId)
      .single();

    if (!quote) return jsonResponse({ error: "quote_not_found" }, 404);

    const quoteItems = (quote.quote_items ?? []) as { description: string; quantity: number; unit_price: number }[];

    // 3. جلب odoo_id للعميل
    const clientOdooId = (quote.clients as { odoo_id: number | null } | null)?.odoo_id;
    if (!clientOdooId) {
      return jsonResponse({ error: "client_not_synced", message: "Le client n'est pas synchronisé avec Odoo" }, 400);
    }

    // 4. إنشاء Sale Order في Odoo
    const orderLines = quoteItems.map((it) => ({
      name: it.description,
      product_uom_qty: it.quantity,
      price_unit: it.unit_price,
    }));

    const saleOrderId = await odooExecute<number>(ctx, "sale.order", "create", [{
      partner_id: clientOdooId,
      order_line: orderLines.map((line) => [0, 0, line]),
      client_order_ref: project_name ?? quote.quote_number,
    }]);

    // 5. تأكيد أمر البيع (تحويله إلى Sale Order مؤكد)
    await odooExecute(ctx, "sale.order", "action_confirm", [[saleOrderId]]);

    return jsonResponse({
      success: true,
      odoo_sale_order_id: saleOrderId,
    });
  } catch (err) {
    console.error("push-quote-to-odoo failed:", err);
    const message = err instanceof Error ? err.message : "Erreur";
    return jsonResponse({ error: "server_error", message }, 500);
  }
});