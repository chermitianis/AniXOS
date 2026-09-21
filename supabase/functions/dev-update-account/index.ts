// ============================================================================
// dev-update-account Edge Function
//
// المرحلة 5 - الدفعة 3B
//
// إجراءات إدارة الحسابات للمطوّر فقط:
//   - extend_trial : تمديد الفترة التجريبية بـ X أيام
//   - change_plan  : تغيير الخطة (trial/standard/premium) + الحالة
//   - suspend      : تعليق الحساب
//   - unsuspend    : رفع التعليق
//
// يستخدم SERVICE_ROLE_KEY لتجاوز RLS و trigger الحماية على الحقول الحساسة.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DEVELOPER_EMAILS = ["chermitti.aniss9@gmail.com"];

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) التحقق من صلاحية المطور
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

    if (!DEVELOPER_EMAILS.includes(callerUser.email.toLowerCase())) {
      return jsonResponse({ error: "forbidden", message: "مخصص للمطور فقط" }, 403);
    }

    // 2) قراءة المدخلات
    const body = await req.json();
    const { action, account_id, payload } = body;

    if (!action || !account_id) {
      return jsonResponse({ error: "invalid_input", message: "action و account_id مطلوبان" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3) جلب الحساب
    const { data: account, error: accErr } = await admin
      .from("accounts")
      .select("*")
      .eq("id", account_id)
      .maybeSingle();

    if (accErr || !account) {
      return jsonResponse({ error: "not_found", message: "الحساب غير موجود" }, 404);
    }

    // 4) تنفيذ الإجراء
    const now = new Date();
    let updatePayload: Record<string, unknown> = {};
    let eventType = "";
    let eventData: Record<string, unknown> = {};

    switch (action) {
      case "extend_trial": {
        const days = Number(payload?.days ?? 30);
        if (!Number.isFinite(days) || days <= 0 || days > 365) {
          return jsonResponse({ error: "invalid_days", message: "عدد الأيام غير صحيح" }, 400);
        }
        const baseDate = account.trial_ends_at && new Date(account.trial_ends_at) > now
          ? new Date(account.trial_ends_at)
          : now;
        const newDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
        updatePayload = {
          trial_ends_at: newDate.toISOString(),
          subscription_status: "trial",
        };
        eventType = "trial_extended";
        eventData = { days, new_trial_ends_at: newDate.toISOString() };
        break;
      }

      case "change_plan": {
        const plan = String(payload?.plan ?? "");
        const status = String(payload?.status ?? "active");
        if (!["trial", "standard", "premium"].includes(plan)) {
          return jsonResponse({ error: "invalid_plan", message: "خطة غير صحيحة" }, 400);
        }
        if (!["trial", "active", "expired", "suspended", "cancelled"].includes(status)) {
          return jsonResponse({ error: "invalid_status", message: "حالة غير صحيحة" }, 400);
        }
        updatePayload = { plan, subscription_status: status };
        if (status === "active") {
          updatePayload.current_period_end = new Date(
            now.getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString();
        }
        eventType = "plan_changed";
        eventData = { old_plan: account.plan, new_plan: plan, new_status: status };
        break;
      }

      case "suspend": {
        updatePayload = { subscription_status: "suspended", suspended_by_admin: true };
        eventType = "suspended";
        eventData = { by: callerUser.email };
        break;
      }

      case "unsuspend": {
        updatePayload = { subscription_status: "active", suspended_by_admin: false };
        eventType = "unsuspended";
        eventData = { by: callerUser.email };
        break;
      }

      default:
        return jsonResponse({ error: "unknown_action", message: "إجراء غير معروف" }, 400);
    }

    // 5) تحديث الحساب (service_role يتجاوز trigger الحماية)
    const { error: updateErr } = await admin
      .from("accounts")
      .update(updatePayload)
      .eq("id", account_id);

    if (updateErr) {
      console.error("[dev-update-account] update failed:", updateErr);
      return jsonResponse({ error: "update_failed", message: updateErr.message }, 500);
    }

    // 6) تسجيل الحدث
    await admin.from("account_events").insert({
      account_id,
      event_type: eventType,
      event_data: eventData,
      performed_by: callerUser.email,
    });

    return jsonResponse({
      success: true,
      action,
      account_id,
      updates: updatePayload,
    });
  } catch (err) {
    console.error("dev-update-account failed:", err);
    return jsonResponse({ error: "server_error", message: "خطأ غير متوقع" }, 500);
  }
});