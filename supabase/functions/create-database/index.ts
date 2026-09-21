// ============================================================================
// create-database Edge Function
//
// المرحلة 4.5 — إنشاء قاعدة بيانات إضافية لحساب موجود.
//
// السلوك:
//   - المستدعي: مالك الحساب (يُتحقق عبر staff_users.is_owner)
//   - يستقبل: { database_name, company_name, industry? }
//   - يتحقق من max_databases (حسب accounts.max_databases)
//   - ينشئ: companies + databases + staff_users (owner للقاعدة الجديدة)
//   - يستنسخ 5 أدوار نظامية للشركة الجديدة
//   - يسجّل account_events (event_type = 'database_created')
//
// Rollback: إن فشل أي شيء بعد إنشاء companies → نحذف companies (CASCADE يحذف الباقي)
//
// ملاحظة: نحن نستخدم SERVICE_ROLE_KEY، لذا RLS غير مطبقة على هذه العملية.
// التحقق من ملكية الحساب يتم يدويًا عبر auth.getUser() + استعلام staff_users.
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

  let createdCompanyId: string | null = null;

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
    const { database_name, company_name, industry } = body;

    if (!database_name || !company_name) {
      return jsonResponse(
        { error: "invalid_input", message: "اسم القاعدة واسم الشركة مطلوبان" },
        400,
      );
    }

    const trimmedDbName = String(database_name).trim();
    const trimmedCompanyName = String(company_name).trim();

    if (trimmedDbName.length < 2) {
      return jsonResponse(
        { error: "invalid_database_name", message: "اسم قاعدة البيانات قصير جدًا" },
        400,
      );
    }

    if (trimmedCompanyName.length < 2) {
      return jsonResponse(
        { error: "invalid_company_name", message: "اسم الشركة قصير جدًا" },
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
      .select("account_id, is_owner")
      .eq("auth_user_id", callerUser.id)
      .eq("is_owner", true)
      .limit(1)
      .maybeSingle();

    if (!callerStaff || !callerStaff.account_id) {
      return jsonResponse(
        { error: "forbidden", message: "فقط مالك الحساب يمكنه إنشاء قاعدة بيانات جديدة" },
        403,
      );
    }

    const accountId = callerStaff.account_id;

    // ---------------------------------------------------------------------
    // 4) التحقق من عدد القواعد الحالي
    // ---------------------------------------------------------------------
    const { data: account } = await admin
      .from("accounts")
      .select("max_databases, owner_full_name, email, is_developer")
      .eq("id", accountId)
      .single();

    if (!account) {
      return jsonResponse({ error: "account_not_found", message: "الحساب غير موجود" }, 404);
    }

    const { count: existingCount } = await admin
      .from("databases")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);

    const currentCount = existingCount ?? 0;
    const maxAllowed = account.max_databases ?? 5;

    if (currentCount >= maxAllowed) {
      return jsonResponse(
        {
          error: "database_limit_reached",
          message: `لقد وصلت للحد الأقصى (${maxAllowed} قواعد بيانات)`,
        },
        400,
      );
    }

    // ---------------------------------------------------------------------
    // 5) التحقق من تفرد اسم القاعدة لهذا الحساب
    // ---------------------------------------------------------------------
    const { data: existingDb } = await admin
      .from("databases")
      .select("id")
      .eq("account_id", accountId)
      .ilike("name", trimmedDbName)
      .maybeSingle();

    if (existingDb) {
      return jsonResponse(
        { error: "database_name_taken", message: "هذا الاسم مستخدم بالفعل" },
        400,
      );
    }

    // ---------------------------------------------------------------------
    // 6) إنشاء الشركة الجديدة
    // ---------------------------------------------------------------------
    const { data: company, error: companyError } = await admin
      .from("companies")
      .insert({
        name: trimmedCompanyName,
        industry: industry?.trim() || null,
        operation_mode: "standalone",
        is_developer_account: account.is_developer,
        subscription_plan: account.is_developer ? "premium" : "trial",
        trial_ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        account_id: accountId,
      })
      .select()
      .single();

    if (companyError || !company) {
      throw new Error(`تعذر إنشاء الشركة: ${companyError?.message}`);
    }

    createdCompanyId = company.id;

    // ---------------------------------------------------------------------
    // 7) استنساخ 5 أدوار نظامية
    // ---------------------------------------------------------------------
    const { data: templates, error: templatesError } = await admin
      .from("roles")
      .select("code, name, permissions")
      .is("company_id", null);

    if (templatesError || !templates || templates.length === 0) {
      throw new Error("تعذر تحميل قوالب الأدوار الافتراضية");
    }

    const { data: clonedRoles, error: cloneError } = await admin
      .from("roles")
      .insert(
        templates.map((tpl) => ({
          company_id: company.id,
          code: tpl.code,
          name: tpl.name,
          is_system: false,
          permissions: tpl.permissions,
        })),
      )
      .select();

    if (cloneError || !clonedRoles) {
      throw new Error("تعذر استنساخ الأدوار");
    }

    const ownerRole = clonedRoles.find((r) => r.code === "owner");
    if (!ownerRole) {
      throw new Error("دور المالك غير موجود بعد الاستنساخ");
    }

    // ---------------------------------------------------------------------
    // 8) إنشاء صف databases
    // ---------------------------------------------------------------------
    const { error: dbError } = await admin.from("databases").insert({
      account_id: accountId,
      company_id: company.id,
      name: trimmedDbName,
    });

    if (dbError) {
      throw new Error(`تعذر إنشاء قاعدة البيانات: ${dbError.message}`);
    }

    // ---------------------------------------------------------------------
    // 9) إنشاء staff_users (المالك للقاعدة الجديدة)
    // ---------------------------------------------------------------------
    const { error: staffError } = await admin.from("staff_users").insert({
      auth_user_id: callerUser.id,
      account_id: accountId,
      company_id: company.id,
      role_id: ownerRole.id,
      full_name: account.owner_full_name,
      email: account.email,
      is_owner: true,
      is_active: true,
    });

    if (staffError) {
      throw new Error(`تعذر إنشاء صف الموظف: ${staffError.message}`);
    }

    // ---------------------------------------------------------------------
    // 10) تسجيل account_events
    // ---------------------------------------------------------------------
    await admin.from("account_events").insert({
      account_id: accountId,
      event_type: "database_created",
      event_data: {
        company_name: trimmedCompanyName,
        database_name: trimmedDbName,
        industry: industry ?? null,
        database_count_before: currentCount,
        database_count_after: currentCount + 1,
      },
      performed_by: "owner",
    });

    // ---------------------------------------------------------------------
    // النجاح
    // ---------------------------------------------------------------------
    return jsonResponse({
      success: true,
      database: {
        id: company.id,
        name: trimmedDbName,
        company_name: trimmedCompanyName,
      },
      count: { current: currentCount + 1, max: maxAllowed },
    });
  } catch (err) {
    console.error("create-database failed, rolling back:", err);

    // Rollback: حذف الشركة (CASCADE يحذف: databases, staff_users, roles)
    if (createdCompanyId) {
      await admin
        .from("companies")
        .delete()
        .eq("id", createdCompanyId)
        .then(({ error }) => {
          if (error) console.error("rollback delete company failed:", error);
        });
    }

    return jsonResponse(
      { error: "provisioning_failed", message: "تعذر إنشاء قاعدة البيانات، لم يُحفظ أي شيء" },
      500,
    );
  }
});