// ============================================================================
// create-account Edge Function
//
// المرحلة 2 من نظام الاشتراكات والحسابات المتعددة.
//
// تستقبل 9 حقول، وتنشئ حسابًا كاملًا (account + company + database +
// staff_user) مع حساب auth.users، بشكل ذرّي مع rollback شامل.
//
// الحقول المُستقبلة:
//   owner_full_name   (إلزامي)
//   company_name      (إلزامي)
//   industry          (اختياري)
//   phone             (اختياري)
//   address           (اختياري)
//   owner_email       (إلزامي)
//   database_name     (إلزامي)
//   owner_password    (إلزامي، ≥ 8)
//
// الترتيب الإلزامي (بسبب FK companies.account_id → accounts.id):
//   1. التحقق من صحة المدخلات
//   2. إنشاء auth.users
//   3. إنشاء companies (بدون account_id — مؤقتًا)
//   4. استنساخ 5 أدوار نظامية
//   5. إنشاء accounts
//   5.b ربط companies.account_id (بعد وجود accounts)
//   6. إنشاء databases
//   7. إنشاء staff_users (owner)
//   8. تسجيل account_events (created)
//
// Rollback:
//   نحذف صراحةً databases → staff_users → companies → auth.users
//   (لأن companies.account_id يستخدم ON DELETE SET NULL وليس CASCADE)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let createdAuthUserId: string | null = null;
  let createdCompanyId: string | null = null;

  try {
    // ---------------------------------------------------------------------
    // 1) تحليل المدخلات والتحقق منها
    // ---------------------------------------------------------------------
    const body = await req.json();
    const {
      owner_full_name,
      company_name,
      industry,
      phone,
      address,
      owner_email,
      database_name,
      owner_password,
    } = body;

    if (
      !owner_full_name ||
      !company_name ||
      !owner_email ||
      !database_name ||
      !owner_password
    ) {
      return jsonResponse(
        { error: "invalid_input", message: "الحقول الإلزامية مفقودة" },
        400,
      );
    }

    if (!isValidEmail(owner_email)) {
      return jsonResponse(
        { error: "invalid_email", message: "البريد الإلكتروني غير صحيح" },
        400,
      );
    }

    if (owner_password.length < 8) {
      return jsonResponse(
        { error: "weak_password", message: "كلمة السر يجب ألا تقل عن 8 محارف" },
        400,
      );
    }

    if (database_name.trim().length < 2) {
      return jsonResponse(
        { error: "invalid_database_name", message: "اسم قاعدة البيانات قصير جدًا" },
        400,
      );
    }

    const normalizedEmail = owner_email.toLowerCase().trim();
    const isDeveloperAccount = DEVELOPER_EMAILS.includes(normalizedEmail);

    // ---------------------------------------------------------------------
    // 2) إنشاء auth.users
    // ---------------------------------------------------------------------
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: owner_password,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      const msg = authError?.message ?? "تعذر إنشاء الحساب";
      const isDuplicate =
        msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("registered");

      return jsonResponse(
        {
          error: isDuplicate ? "email_taken" : "auth_creation_failed",
          message: isDuplicate
            ? "هذا البريد الإلكتروني مستخدم بالفعل"
            : msg,
        },
        400,
      );
    }

    createdAuthUserId = authData.user.id;

    // ---------------------------------------------------------------------
    // 3) إنشاء companies (بدون account_id — سيُربط لاحقًا بعد إنشاء accounts)
    // ---------------------------------------------------------------------
    const { data: company, error: companyError } = await admin
      .from("companies")
      .insert({
        name: company_name.trim(),
        industry: industry?.trim() || null,
        operation_mode: "standalone",
        is_developer_account: isDeveloperAccount,
        subscription_plan: "trial",
        trial_ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        // ⛔ account_id مؤجل حتى الخطوة 5.b (FK constraint)
      })
      .select()
      .single();

    if (companyError || !company) {
      throw new Error(`تعذر إنشاء الشركة: ${companyError?.message}`);
    }

    createdCompanyId = company.id;

    // ---------------------------------------------------------------------
    // 4) استنساخ 5 أدوار نظامية
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
    // 5.a) إنشاء accounts
    // ---------------------------------------------------------------------
    const { error: accountError } = await admin
      .from("accounts")
      .insert({
        id: createdAuthUserId,
        email: normalizedEmail,
        owner_full_name: owner_full_name.trim(),
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        is_developer: isDeveloperAccount,
        subscription_status: isDeveloperAccount ? "active" : "trial",
        plan: isDeveloperAccount ? "premium" : "trial",
        trial_ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        max_databases: isDeveloperAccount ? 999 : 5,
        active_company_id: company.id,
      });

    if (accountError) {
      throw new Error(`تعذر إنشاء الحساب: ${accountError.message}`);
    }

    // ---------------------------------------------------------------------
    // 5.b) ربط companies.account_id (بعد وجود accounts — FK constraint)
    // ---------------------------------------------------------------------
    const { error: linkError } = await admin
      .from("companies")
      .update({ account_id: createdAuthUserId })
      .eq("id", company.id);

    if (linkError) {
      throw new Error(`تعذر ربط الشركة بالحساب: ${linkError.message}`);
    }

    // ---------------------------------------------------------------------
    // 6) إنشاء databases
    // ---------------------------------------------------------------------
    const { error: dbError } = await admin
      .from("databases")
      .insert({
        account_id: createdAuthUserId,
        company_id: company.id,
        name: database_name.trim(),
      });

    if (dbError) {
      throw new Error(`تعذر إنشاء قاعدة البيانات: ${dbError.message}`);
    }

    // ---------------------------------------------------------------------
    // 7) إنشاء staff_users (owner)
    // ---------------------------------------------------------------------
    const { error: staffError } = await admin
      .from("staff_users")
      .insert({
        auth_user_id: createdAuthUserId,
        account_id: createdAuthUserId,
        company_id: company.id,
        role_id: ownerRole.id,
        full_name: owner_full_name.trim(),
        email: normalizedEmail,
        is_owner: true,
        is_active: true,
      });

    if (staffError) {
      throw new Error(`تعذر إنشاء صف الموظف: ${staffError.message}`);
    }

    // ---------------------------------------------------------------------
    // 8) تسجيل account_events
    // ---------------------------------------------------------------------
    await admin.from("account_events").insert({
      account_id: createdAuthUserId,
      event_type: "created",
      event_data: {
        company_name: company.name,
        database_name: database_name.trim(),
        industry: industry ?? null,
        is_developer: isDeveloperAccount,
      },
      performed_by: "system",
    });

    // ---------------------------------------------------------------------
    // النجاح
    // ---------------------------------------------------------------------
    return jsonResponse({
      success: true,
      account: { id: createdAuthUserId, email: normalizedEmail },
      company: { id: company.id, name: company.name },
      database: { name: database_name.trim() },
    });
  } catch (err) {
    console.error("create-account failed, rolling back:", err);

    // ---------------------------------------------------------------------
    // Rollback صريح بالترتيب العكسي
    // (ON DELETE SET NULL على companies.account_id لا يكفي)
    // ---------------------------------------------------------------------
    if (createdCompanyId) {
      // حذف databases المرتبطة بالشركة
      await admin
        .from("databases")
        .delete()
        .eq("company_id", createdCompanyId)
        .then(({ error }) => {
          if (error) console.error("rollback databases failed:", error);
        });

      // حذف staff_users المرتبطة بالشركة
      await admin
        .from("staff_users")
        .delete()
        .eq("company_id", createdCompanyId)
        .then(({ error }) => {
          if (error) console.error("rollback staff_users failed:", error);
        });

      // حذف roles المستنسخة (إن لم يكن CASCADE على roles.company_id)
      await admin
        .from("roles")
        .delete()
        .eq("company_id", createdCompanyId)
        .then(({ error }) => {
          if (error) console.error("rollback roles failed:", error);
        });

      // حذف الشركة
      await admin
        .from("companies")
        .delete()
        .eq("id", createdCompanyId)
        .then(({ error }) => {
          if (error) console.error("rollback companies failed:", error);
        });
    }

    // حذف auth.users (يحذف accounts بـ CASCADE)
    if (createdAuthUserId) {
      await admin.auth.admin
        .deleteUser(createdAuthUserId)
        .catch((e) => console.error("rollback deleteUser failed:", e));
    }

    return jsonResponse(
      {
        error: "provisioning_failed",
        message: "تعذر إنشاء الحساب، لم يُحفظ أي شيء",
      },
      500,
    );
  }
});