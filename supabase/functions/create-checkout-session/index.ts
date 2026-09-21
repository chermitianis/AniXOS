// ============================================================================
// create-checkout-session Edge Function
//
// Paddle Billing API v2 — version corrigée
// - Endpoint: POST /transactions
// - Pas de `checkout.url` ni `settings.success_url` (non supportés)
// - Le Checkout est généré automatiquement par Paddle (hosted)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY")!;
const PADDLE_ENV = (Deno.env.get("PADDLE_ENV") ?? "sandbox") as "sandbox" | "production";

const PADDLE_PRICE_STANDARD_MONTHLY = Deno.env.get("PADDLE_PRICE_STANDARD_MONTHLY")!;
const PADDLE_PRICE_STANDARD_YEARLY = Deno.env.get("PADDLE_PRICE_STANDARD_YEARLY")!;
const PADDLE_PRICE_PREMIUM_MONTHLY = Deno.env.get("PADDLE_PRICE_PREMIUM_MONTHLY")!;
const PADDLE_PRICE_PREMIUM_YEARLY = Deno.env.get("PADDLE_PRICE_PREMIUM_YEARLY")!;

const PADDLE_API_BASE =
  PADDLE_ENV === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

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

function resolvePriceId(plan: string, billing: string): string | null {
  if (plan === "standard" && billing === "monthly") return PADDLE_PRICE_STANDARD_MONTHLY;
  if (plan === "standard" && billing === "yearly") return PADDLE_PRICE_STANDARD_YEARLY;
  if (plan === "premium" && billing === "monthly") return PADDLE_PRICE_PREMIUM_MONTHLY;
  if (plan === "premium" && billing === "yearly") return PADDLE_PRICE_PREMIUM_YEARLY;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized", message: "غير مصرح" }, 401);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser || !callerUser.email) {
      return jsonResponse({ error: "unauthorized", message: "جلسة غير صالحة" }, 401);
    }

    // 2) Inputs
    const body = await req.json();
    const { plan, billing_cycle } = body;

    if (!plan || !["standard", "premium"].includes(plan)) {
      return jsonResponse({ error: "invalid_plan", message: "خطة غير صحيحة" }, 400);
    }
    if (!billing_cycle || !["monthly", "yearly"].includes(billing_cycle)) {
      return jsonResponse({ error: "invalid_billing", message: "دورة فاتورة غير صحيحة" }, 400);
    }

    const priceId = resolvePriceId(plan, billing_cycle);
    if (!priceId) {
      return jsonResponse(
        { error: "price_not_configured", message: "لم يتم ضبط معرّف السعر" },
        400,
      );
    }

    // 3) Account
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: account, error: accErr } = await admin
      .from("accounts")
      .select("id, email, owner_full_name, paddle_customer_id")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (accErr || !account) {
      return jsonResponse({ error: "account_not_found", message: "الحساب غير موجود" }, 404);
    }

    // 4) Build minimal Paddle payload (API v2 — pas de checkout.url)
    const origin = req.headers.get("origin") ?? "https://anixos.vercel.app";

    const paddlePayload: Record<string, unknown> = {
      items: [
        {
          price_id: priceId,
          quantity: 1,
        },
      ],
      custom_data: {
        account_id: account.id,
        plan,
        billing_cycle,
      },
      // URL de succès — supporté uniquement au niveau de la transaction dans v2
      // NOTE: `checkout.url` n'existe pas dans l'API v2 pour /transactions.
      // Paddle utilise automatiquement le "Default Payment Link" du compte.
      // Pour rediriger après paiement, configurer dans Paddle Dashboard.
    };

    // Customer (si connu)
    if (account.paddle_customer_id) {
      paddlePayload.customer_id = account.paddle_customer_id;
    } else {
      paddlePayload.customer = {
        email: account.email,
        name: account.owner_full_name ?? undefined,
      };
    }

    // 5) Call Paddle
    const paddleRes = await fetch(`${PADDLE_API_BASE}/transactions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paddlePayload),
    });

    const paddleData = await paddleRes.json();

    if (!paddleRes.ok) {
      console.error("[create-checkout-session] Paddle API error:", JSON.stringify(paddleData));
      return jsonResponse(
        {
          error: "paddle_api_error",
          message: paddleData?.error?.detail ?? "فشل الاتصال بـ Paddle",
          code: paddleData?.error?.code,
        },
        500,
      );
    }

       // 6) Return transaction_id (Paddle.js ouvrira l'overlay dans le frontend)
       const transactionId = paddleData?.data?.id;

       if (!transactionId) {
         console.error("[create-checkout-session] no transaction_id:", JSON.stringify(paddleData));
         return jsonResponse(
           { error: "no_transaction_id", message: "لم يُرجع Paddle معرّف العملية" },
           500,
         );
       }
   
       return jsonResponse({
         success: true,
         transaction_id: transactionId,
         origin,
       });
     } catch (err) {
       console.error("create-checkout-session failed:", err);
       return jsonResponse({ error: "server_error", message: "خطأ غير متوقع" }, 500);
     }
   });