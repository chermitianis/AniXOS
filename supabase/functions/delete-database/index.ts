// ============================================================================
// delete-database Edge Function
//
// المرحلة 4.6 — حذف قاعدة بيانات (company) بكامل محتواها.
//
// الحمايات:
//   1. المستدعي يجب أن يكون مالك الحساب (staff_users.is_owner = true)
//   2. لا يمكن حذف القاعدة النشطة (accounts.active_company_id)
//   3. لا يمكن حذف آخر قاعدة (يجب أن تبقى واحدة على الأقل)
//   4. القاعدة يجب أن تنتمي فعلاً لحساب المستدعي
//
// التسلسل:
//   1. التحقق من الجلسة
//   2. قراءة database_id
//   3. التحقق من الملكية
//   4. فحص جميع القيود (لا نشطة، ليس آخر)
//   5. حذف companies (CASCADE: databases, staff_users, roles, ...)
//   6. تسجيل account_events
//
// ملاحظة: نحن نستخدم SERVICE_ROLE_KEY، لذا RLS غير مطبقة. التحقق يدوي.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    // ---------------------------------------------------------------------
    // 1) التحقق من الجلسة
    // ---------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized", message: "غير مصرح" }, 401);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser) {
      return jsonResponse({ error: "unauthorized", message: "جلسة غير صالحة" }, 401);
    }

    // ---------------------------------------------------------------------
    // 2) قراءة المدخلات
    // ---------------------------------------------------------------------
    const body = await req.json();
    const { database_id } = body;

    if (!database_id || typeof database_id !== "string") {
      return jsonResponse(
        { error: "invalid_input", message: "معرّف القاعدة مطلوب" },
        400,
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ---------------------------------------------------------------------
    // 3) التحقق من أن المستدعي مالك الحساب
    // ---------------------------------------------------------------------
    const { data: callerStaff } = await admin
      .from("staff_users")
      .select("account_id, is_owner, company_id")
      .eq("auth_user_id", callerUser.id)
      .eq("is_owner", true)
      .limit(1)
      .maybeSingle();

    if (!callerStaff || !callerStaff.account_id) {
      return jsonResponse(
        { error: "forbidden", message: "فقط مالك الحساب يمكنه حذف قاعدة بيانات" },
        403,
      );
    }

    const accountId = callerStaff.account_id;

    // ---------------------------------------------------------------------
    // 4) التحقق من أن القاعدة تنتمي للحساب
    // ---------------------------------------------------------------------
    const { data: targetDb } = await admin
      .from("databases")
      .select("id, name, company_id, account_id")
      .eq("id", database_id)
      .eq("account_id", accountId)
      .maybeSingle();

    if (!targetDb) {
      return jsonResponse(
        { error: "not_found", message: "القاعدة غير موجودة أو لا تنتمي لحسابك" },
        404,
      );
    }

    // ---------------------------------------------------------------------
    // 5) فحص القاعدة النشطة (لا يجوز حذفها)
    // ---------------------------------------------------------------------
    const { data: account } = await admin
      .from("accounts")
      .select("active_company_id")
      .eq("id", accountId)
      .single();

    if (account?.active_company_id === targetDb.company_id) {
      return jsonResponse(
        {
          error: "cannot_delete_current",
          message: "لا يمكن حذف القاعدة النشطة. بدّل إلى قاعدة أخرى أولًا.",
        },
        400,
      );
    }

    // ---------------------------------------------------------------------
    // 6) فحص أنها ليست آخر قاعدة
    // ---------------------------------------------------------------------
    const { count: dbCount } = await admin
      .from("databases")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);

    if ((dbCount ?? 0) <= 1) {
      return jsonResponse(
        {
          error: "cannot_delete_last",
          message: "لا يمكن حذف آخر قاعدة بيانات في حسابك.",
        },
        400,
      );
    }

    // ---------------------------------------------------------------------
    // 7) الحذف (CASCADE يحذف كل المرتبط: databases, staff_users, roles,
    //    workers, projects, machines, sessions, ...)
    // ---------------------------------------------------------------------
    const { error: deleteError } = await admin
      .from("companies")
      .delete()
      .eq("id", targetDb.company_id);

    if (deleteError) {
      throw new Error(`تعذر حذف القاعدة: ${deleteError.message}`);
    }

    // ---------------------------------------------------------------------
    // 8) تسجيل الحدث
    // ---------------------------------------------------------------------
    await admin.from("account_events").insert({
      account_id: accountId,
      event_type: "database_deleted",
      event_data: {
        database_id: targetDb.id,
        database_name: targetDb.name,
        company_id: targetDb.company_id,
        database_count_after: (dbCount ?? 1) - 1,
      },
      performed_by: "owner",
    });

    // ---------------------------------------------------------------------
    // النجاح
    // ---------------------------------------------------------------------
    return jsonResponse({
      success: true,
      deleted: {
        database_id: targetDb.id,
        database_name: targetDb.name,
      },
    });
  } catch (err) {
    console.error("delete-database failed:", err);
    return jsonResponse(
      {
        error: "deletion_failed",
        message: "تعذر حذف القاعدة، لم يُحفظ أي تغيير",
      },
      500,
    );
  }
});