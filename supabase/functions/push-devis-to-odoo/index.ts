// ============================================================================
// supabase/functions/push-devis-to-odoo/index.ts
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("ODOO_ENCRYPTION_KEY") ?? "anixos-odoo-default-key-change-me";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

interface OdooContext { url: string; db: string; uid: number; apiKey: string; }

async function odooExecute<T = unknown>(
  ctx: OdooContext,
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
    // ✅ قراءة الجسم أولاً (لتجنب "body already consumed")
    const body = await req.json().catch(() => ({}));
    const { quote_id, company_id } = body as { quote_id?: string; company_id?: string };

    if (!quote_id) {
      return jsonResponse({ error: "missing_quote_id" }, 400);
    }

    const cronSecretHeader = req.headers.get("x-cron-secret");
    let companyId: string;
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (cronSecretHeader && company_id) {
      // ✅ دعم x-cron-secret (للاختبار)
      companyId = company_id;
    } else {
      // ✅ دعم JWT (للاستخدام العادي)
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: callerUser } } = await callerClient.auth.getUser();
      if (!callerUser) return jsonResponse({ error: "unauthorized" }, 401);
      const { data: staff } = await adminClient
        .from("staff_users")
        .select("company_id")
        .eq("auth_user_id", callerUser.id)
        .eq("is_owner", true)
        .limit(1)
        .maybeSingle();
      if (!staff) return jsonResponse({ error: "forbidden" }, 403);
      companyId = (staff as { company_id: string }).company_id;
    }

    // 1. التحقق من Odoo
    const { data: config } = await adminClient
      .from("odoo_config")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!config) {
      return jsonResponse({ error: "odoo_not_active" }, 400);
    }

    const cfg = config as Record<string, unknown>;
    const apiKey = await decryptApiKey(cfg.api_key_encrypted as string);
    const uid = await authenticateOdoo(cfg.odoo_url as string, cfg.odoo_db as string, cfg.odoo_username as string, apiKey);
    const ctx: OdooContext = { url: cfg.odoo_url as string, db: cfg.odoo_db as string, uid, apiKey };

    // 2. جلب الـ Devis
    const { data: quote, error: quoteError } = await adminClient
      .from("quotes")
      .select("*, quote_items(*), clients(odoo_id)")
      .eq("id", quote_id)
      .eq("company_id", companyId)
      .single();

    if (quoteError || !quote) {
      return jsonResponse({ error: "quote_not_found" }, 404);
    }

    const q = quote as Record<string, unknown>;
    const clientOdooId = (q.clients as { odoo_id: number | null } | null)?.odoo_id;
    const quoteNumber = q.quote_number as string;

    if (!clientOdooId) {
      return jsonResponse({ error: "client_not_synced" }, 400);
    }

    // 3. البحث عن Sale Order موجود (عبر client_order_ref)
    const existingOrders = await odooExecute<number[]>(
      ctx, "sale.order", "search",
      [[["client_order_ref", "=", quoteNumber]]],
      { limit: 1 }
    );

    let saleOrderId: number;

    if (existingOrders && existingOrders.length > 0) {
      saleOrderId = existingOrders[0];
    } else {
      // 4. إنشاء Sale Order
      const quoteItems = (q.quote_items ?? []) as Array<{
        description: string;
        quantity: number;
        unit_price: number;
        piece_type?: string;
      }>;

      // فلترة: main_product فقط
      const mainProducts = quoteItems.filter((it) => !it.piece_type || it.piece_type === "main_product");
      
      const orderLines = mainProducts.map((it) => ({
        name: it.description,
        product_uom_qty: it.quantity,
        price_unit: it.unit_price,
      }));

      saleOrderId = await odooExecute<number>(ctx, "sale.order", "create", [{
        partner_id: clientOdooId,
        client_order_ref: quoteNumber,
        order_line: orderLines.map((line) => [0, 0, line]),
      }]);

      // تأكيد Sale Order إذا كان مقبولاً
      const quoteStatus = q.status as string;
      if (quoteStatus === "accepted") {
        await odooExecute(ctx, "sale.order", "action_confirm", [[saleOrderId]]);
      }
    }

    // 5. جلب اسم Sale Order وتحديث odoo_reference
    const [saleOrderData] = await odooExecute<Array<{ name: string }>>(
      ctx, "sale.order", "read", [[saleOrderId]], { fields: ["name"] }
    );

    const odooReference = saleOrderData?.name ?? null;

    await adminClient
    .from("quotes")
    .update({ 
      odoo_reference: odooReference,
      client_order_ref: quoteNumber, // ✅ ربط AniXOS بـ Odoo
    })
    .eq("id", quote_id);

    return jsonResponse({
      success: true,
      odoo_sale_order_id: saleOrderId,
      odoo_reference: odooReference,
    });
  } catch (err) {
    console.error("push-devis-to-odoo failed:", err);
    const message = err instanceof Error ? err.message : "Erreur";
    return jsonResponse({ error: "server_error", message }, 500);
  }
});