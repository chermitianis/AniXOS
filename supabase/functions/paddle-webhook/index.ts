// ============================================================================
// paddle-webhook Edge Function
//
// المرحلة 4.3B — استقبال Webhooks من Paddle
//
// الأحداث المُعالَجة:
//   - subscription.created    → تفعيل الحساب + حفظ subscription_id
//   - subscription.updated    → تحديث الخطة/الحالة
//   - subscription.cancelled  → إلغاء الحساب
//   - subscription.past_due   → تنبيه (لم يُدفع)
//   - transaction.completed   → تسجيل الدفعة + تفعيل الحساب
//   - transaction.payment_failed → إرسال تنبيه
//
// الأمان: التحقق من HMAC signature عبر PADDLE_WEBHOOK_SECRET.
//
// ⚠️ مهم: هذا الـ Webhook يجب أن يكون على URL عام (public).
//   في Supabase: يُنشر تلقائيًا كـ `https://<project>.supabase.co/functions/v1/paddle-webhook`
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PADDLE_WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paddle-signature",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * يتحقق من HMAC signature الخاص بـ Paddle.
 * الصيغة: `ts=<timestamp>;h1=<hmac>`
 * المُوقَّع: `${ts}:${rawBody}`
 */
async function verifySignature(rawBody: string, signatureHeader: string): Promise<boolean> {
  try {
    const parts = signatureHeader.split(";");
    const ts = parts.find((p) => p.startsWith("ts="))?.slice(3);
    const h1 = parts.find((p) => p.startsWith("h1="))?.slice(3);

    if (!ts || !h1) return false;

    const signedPayload = `${ts}:${rawBody}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(PADDLE_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === h1;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("paddle-signature");

    if (!signatureHeader) {
      return jsonResponse({ error: "missing_signature" }, 401);
    }

    const isValid = await verifySignature(rawBody, signatureHeader);
    if (!isValid) {
      return jsonResponse({ error: "invalid_signature" }, 401);
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.event_type;
    const data = event?.data;

    if (!eventType || !data) {
      return jsonResponse({ error: "invalid_payload" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // --- استخراج account_id من custom_data ---
    const accountId =
      data?.custom_data?.account_id ??
      data?.items?.[0]?.custom_data?.account_id ??
      null;

    if (!accountId) {
      console.warn("[paddle-webhook] no account_id in payload for event:", eventType);
      return jsonResponse({ success: true, warning: "no_account_id" });
    }

    // --- معالجة الأحداث ---
    switch (eventType) {
      case "subscription.created": {
        const subscriptionId = data.id;
        const customerId = data.customer_id;
        const priceId = data.items?.[0]?.price?.id;
        const plan = data.custom_data?.plan ?? "standard";
        const billingCycle = data.custom_data?.billing_cycle ?? "monthly";

        // حساب نهاية الدورة
        const currentPeriodEnd =
          data.current_billing_period?.ends_at ??
          new Date(Date.now() + (billingCycle === "yearly" ? 365 : 30) * 86400000).toISOString();

        await admin
          .from("accounts")
          .update({
            subscription_status: "active",
            plan,
            billing_cycle: billingCycle,
            current_period_end: currentPeriodEnd,
            paddle_customer_id: customerId,
            paddle_subscription_id: subscriptionId,
          })
          .eq("id", accountId);

        await admin.from("account_events").insert({
          account_id: accountId,
          event_type: "subscription_created",
          event_data: { subscription_id: subscriptionId, customer_id: customerId, price_id: priceId, plan, billing_cycle: billingCycle },
          performed_by: "paddle_webhook",
        });

        break;
      }

      case "subscription.updated": {
        const subscriptionId = data.id;
        const status = data.status; // active | past_due | canceled | paused
        const currentPeriodEnd = data.current_billing_period?.ends_at;

        const updatePayload: Record<string, unknown> = {
          paddle_subscription_id: subscriptionId,
        };
        if (status === "active") updatePayload.subscription_status = "active";
        else if (status === "past_due") updatePayload.subscription_status = "expired";
        else if (status === "canceled") updatePayload.subscription_status = "cancelled";
        if (currentPeriodEnd) updatePayload.current_period_end = currentPeriodEnd;

        await admin.from("accounts").update(updatePayload).eq("id", accountId);

        await admin.from("account_events").insert({
          account_id: accountId,
          event_type: "subscription_updated",
          event_data: { subscription_id: subscriptionId, status },
          performed_by: "paddle_webhook",
        });

        break;
      }

      case "subscription.cancelled":
      case "subscription.canceled": {
        await admin
          .from("accounts")
          .update({ subscription_status: "cancelled" })
          .eq("id", accountId);

        await admin.from("account_events").insert({
          account_id: accountId,
          event_type: "subscription_cancelled",
          event_data: { subscription_id: data.id },
          performed_by: "paddle_webhook",
        });

        break;
      }

      case "subscription.past_due": {
        await admin
          .from("accounts")
          .update({ subscription_status: "expired" })
          .eq("id", accountId);

        await admin.from("account_events").insert({
          account_id: accountId,
          event_type: "subscription_past_due",
          event_data: { subscription_id: data.id },
          performed_by: "paddle_webhook",
        });

        break;
      }

      case "transaction.completed": {
        const amount = data.details?.totals?.grand_total;
        const currency = data.currency_code;
        const transactionId = data.id;
      
        // استخراج plan و billing_cycle من custom_data
        const plan = data?.custom_data?.plan ?? "standard";
        const billingCycle = data?.custom_data?.billing_cycle ?? "monthly";
        const customerId = data?.customer_id ?? null;
      
        // حساب نهاية الدورة
        const currentPeriodEnd = new Date(
          Date.now() + (billingCycle === "yearly" ? 365 : 30) * 86400000,
        ).toISOString();
      
        const updatePayload: Record<string, unknown> = {
          subscription_status: "active",
          plan,
          billing_cycle: billingCycle,
          current_period_end: currentPeriodEnd,
        };
        if (customerId) updatePayload.paddle_customer_id = customerId;
      
        await admin
          .from("accounts")
          .update(updatePayload)
          .eq("id", accountId);
      
        await admin.from("account_events").insert({
          account_id: accountId,
          event_type: "payment_completed",
          event_data: { transaction_id: transactionId, amount, currency, plan, billing_cycle: billingCycle },
          performed_by: "paddle_webhook",
        });
      
        break;
      }

      case "transaction.payment_failed": {
        await admin.from("account_events").insert({
          account_id: accountId,
          event_type: "payment_failed",
          event_data: { transaction_id: data.id, reason: data.details?.payment_method?.type },
          performed_by: "paddle_webhook",
        });

        break;
      }

      default:
        console.log("[paddle-webhook] unhandled event type:", eventType);
    }

    return jsonResponse({ success: true, event_type: eventType });
  } catch (err) {
    console.error("paddle-webhook failed:", err);
    return jsonResponse({ error: "server_error", message: "خطأ غير متوقع" }, 500);
  }
});