// ============================================================================
// dev-delete-account Edge Function
//
// حذف حساب كامل بشكل نهائي (لا رجعة فيه).
//
// يستقبل: { account_id, confirm_email }
//
// الحمايات:
//   1. المستدعي = مطوّر (DEVELOPER_EMAILS).
//   2. الحساب المستهدف ليس مطوّرًا.
//   3. confirm_email مُطابق تمامًا لبريد الحساب المستهدف.
//
// ما يحدث:
//   - حذف auth.users(id) → CASCADE يحذف:
//     accounts → databases, companies, account_events
//     companies → كل البيانات التشغيلية (staff_users, workers, machines, ...)
//
// ⚠️ لا رجعة فيه. لا نسخة احتياطية تلقائية.
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
    const { account_id, confirm_email } = body;

    if (!account_id || !confirm_email) {
      return jsonResponse(
        { error: "invalid_input", message: "account_id و confirm_email مطلوبان" },
        400,
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3) جلب الحساب المستهدف
    const { data: account, error: accErr } = await admin
      .from("accounts")
      .select("id, email, is_developer")
      .eq("id", account_id)
      .maybeSingle();

    if (accErr || !account) {
      return jsonResponse({ error: "not_found", message: "الحساب غير موجود" }, 404);
    }

    // 4) الحمايات
    if (account.is_developer) {
      return jsonResponse(
        { error: "cannot_delete_developer", message: "لا يمكن حذف حساب المطور" },
        400,
      );
    }

    if (account.email.toLowerCase() !== confirm_email.trim().toLowerCase()) {
      return jsonResponse(
        { error: "email_mismatch", message: "البريد المُدخل غير مطابق" },
        400,
      );
    }

    // 5) حفظ معلومات للتدقيق (قبل الحذف)
    const deletedEmail = account.email;

    // 6) حذف auth.users → CASCADE يحذف كل شيء
    const { error: deleteErr } = await admin.auth.admin.deleteUser(account_id);

    if (deleteErr) {
      console.error("[dev-delete-account] deleteUser failed:", deleteErr);
      return jsonResponse(
        { error: "delete_failed", message: deleteErr.message ?? "فشل الحذف" },
        500,
      );
    }

    // 7) تسجيل الحدث (على حساب المطور لتوثيق العملية)
    const { data: devAccount } = await admin
      .from("accounts")
      .select("id")
      .eq("email", callerUser.email.toLowerCase())
      .maybeSingle();

    if (devAccount) {
      await admin.from("account_events").insert({
        account_id: devAccount.id,
        event_type: "account_deleted",
        event_data: {
          deleted_account_id: account_id,
          deleted_email: deletedEmail,
        },
        performed_by: callerUser.email,
      });
    }

    return jsonResponse({
      success: true,
      deleted: {
        account_id,
        email: deletedEmail,
      },
    });
  } catch (err) {
    console.error("dev-delete-account failed:", err);
    return jsonResponse({ error: "server_error", message: "خطأ غير متوقع" }, 500);
  }
});