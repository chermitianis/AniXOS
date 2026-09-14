// ============================================================================
// tenant-provisioning Edge Function
//
// يُستدعى مرة واحدة فقط عند إنشاء شركة جديدة (أول تشغيل مطلق للتطبيق أو
// اشتراك SaaS جديد). ينفّذ عمليتين مترابطتين يجب أن تنجحا معاً أو تفشلا معاً:
//   1) إنشاء حساب Supabase Auth حقيقي لبريد المالك
//   2) إنشاء صف الشركة + صف staff_users للمالك بدور "owner"
//   لو فشلت الخطوة الثانية بعد نجاح الأولى، نتراجع (rollback) بحذف حساب
//   Auth الذي أُنشئ، حتى لا يبقى حساب "معلّق" بلا شركة.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// حساب مطور المنصة: يُستثنى تلقائياً وبالكامل من قيود الفترة التجريبية
// والاشتراك المدفوع، بغض النظر عن أي شركة ينشئها لأغراض المعاينة والاختبار.
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

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let createdAuthUserId: string | null = null;

  try {
    const { company_name, industry, owner_email, owner_password, owner_full_name } = await req.json();

    if (!company_name || !owner_email || !owner_password || !owner_full_name) {
      return jsonResponse(
        { error: "invalid_input", message: "بيانات الشركة والمالك مطلوبة بالكامل" },
        400
      );
    }

    if (owner_password.length < 8) {
      return jsonResponse(
        { error: "weak_password", message: "كلمة السر يجب ألا تقل عن 8 محارف" },
        400
      );
    }

    // ------------------------------------------------------------------
    // الخطوة 1: إنشاء حساب Auth حقيقي للمالك
    // ------------------------------------------------------------------
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: owner_email,
      password: owner_password,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      // بريد مكرر أو خطأ آخر من Supabase Auth
      return jsonResponse(
        { error: "auth_creation_failed", message: authError?.message ?? "تعذر إنشاء حساب المالك" },
        400
      );
    }

    createdAuthUserId = authData.user.id;

    // ------------------------------------------------------------------
    // الخطوة 2: إنشاء صف الشركة
    // ------------------------------------------------------------------
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .insert({
        name: company_name,
        industry: industry ?? null,
        operation_mode: "standalone",
        is_developer_account: DEVELOPER_EMAILS.includes(owner_email.toLowerCase()),
      })
      .select()
      .single();

    if (companyError || !company) {
      throw new Error(`تعذر إنشاء الشركة: ${companyError?.message}`);
    }

    // ------------------------------------------------------------------
    // الخطوة 3: استنساخ قوالب الأدوار الخمسة كأدوار خاصة بهذه الشركة
    // تحديداً (وليس استخدام القوالب المشتركة NULL مباشرة) — ضروري لتحقيق
    // "الحرية الكاملة" لمدير كل شركة في إعادة تسمية أدواره وصلاحياته لاحقاً
    // من قسم الإعدادات، دون أي تأثير على بقية الشركات المشتركة في المنصة.
    // ------------------------------------------------------------------
    const { data: systemTemplates, error: templatesError } = await adminClient
      .from("roles")
      .select("code, name, permissions")
      .is("company_id", null);

    if (templatesError || !systemTemplates || systemTemplates.length === 0) {
      throw new Error("تعذر تحميل قوالب الأدوار الافتراضية");
    }

    const { data: clonedRoles, error: cloneError } = await adminClient
      .from("roles")
      .insert(
        systemTemplates.map((tpl) => ({
          company_id: company.id,
          code: tpl.code,
          name: tpl.name,
          is_system: false,
          permissions: tpl.permissions,
        }))
      )
      .select();

    if (cloneError || !clonedRoles) {
      throw new Error("تعذر استنساخ الأدوار الافتراضية للشركة الجديدة");
    }

    const ownerRole = clonedRoles.find((r) => r.code === "owner");
    if (!ownerRole) {
      throw new Error("تعذر العثور على دور المالك بعد الاستنساخ");
    }

    // ------------------------------------------------------------------
    // الخطوة 4: ربط الموظف (المالك) بالشركة
    // ------------------------------------------------------------------
    const { error: staffError } = await adminClient.from("staff_users").insert({
      id: createdAuthUserId,
      company_id: company.id,
      role_id: ownerRole.id,
      full_name: owner_full_name,
      email: owner_email,
      is_owner: true,
    });

    if (staffError) {
      throw new Error(`تعذر ربط المالك بالشركة: ${staffError.message}`);
    }

    return jsonResponse({
      success: true,
      company: { id: company.id, name: company.name },
      owner: { id: createdAuthUserId, email: owner_email },
    });
  } catch (err) {
    console.error("tenant-provisioning failed, rolling back:", err);

    // Rollback: إذا سبق إنشاء حساب Auth ولم تكتمل بقية الخطوات، نحذفه
    // لتفادي وجود حساب "يتيم" بلا شركة ولا صلاحية دخول لأي مكان.
    if (createdAuthUserId) {
      await adminClient.auth.admin.deleteUser(createdAuthUserId).catch((e) =>
        console.error("rollback deleteUser failed:", e)
      );
    }

    return jsonResponse(
      { error: "provisioning_failed", message: "تعذر إنشاء الشركة، لم يُحفظ أي شيء" },
      500
    );
  }
});
