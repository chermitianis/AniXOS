// ============================================================================
// kiosk-credentials-sync Edge Function
//
// الغرض: السماح لجهاز Kiosk (وجهاز Kiosk فقط — ليس موظفاً إدارياً) بتحميل
// نسخة محلية مشفَّرة (bcrypt hash، لا نص صريح أبداً) من بيانات دخول عمال
// شركته، لتخزينها في IndexedDB على الجهاز نفسه. هذا يتيح للعامل تسجيل
// الدخول حتى في حال انقطاع الإنترنت الكامل (الوضع المستقل الحقيقي).
//
// هذا استثناء أمني مقصود ومحدود النطاق جداً:
//   - يعمل فقط لجلسة جهاز device_mode = 'kiosk' (وليس موظف إداري)
//   - يُرجع فقط hash العمال (لا كلمات سر صريحة أبداً)
//   - يُفترض أن يُستدعى دورياً أثناء الاتصال فقط، وليس عند كل تحميل صفحة
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized", message: "الجهاز غير مسجل دخول" }, 401);
    }

    const deviceScopedClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: companyId, error: companyError } = await deviceScopedClient.rpc("get_my_company_id");

    if (companyError || !companyId) {
      return jsonResponse({ error: "unauthorized", message: "جهاز غير مرتبط بأي شركة" }, 403);
    }

    // التحقق الإضافي الحاسم: المستدعي يجب أن يكون جهاز Kiosk فعلياً، وليس
    // جلسة موظف إداري تحمل نفس company_id (لأن الموظف الإداري لا يجوز أن
    // يحصل على نسخة محلية من كل كلمات سر عمال الشركة على جهازه الشخصي)
    const {
      data: { user: callerUser },
    } = await deviceScopedClient.auth.getUser();

    if (!callerUser) {
      return jsonResponse({ error: "unauthorized", message: "جلسة غير صالحة" }, 401);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: device, error: deviceError } = await adminClient
      .from("devices")
      .select("id, device_mode, company_id")
      .eq("auth_user_id", callerUser.id)
      .maybeSingle();

    if (deviceError || !device || device.device_mode !== "kiosk") {
      return jsonResponse(
        { error: "forbidden", message: "هذا الإجراء متاح فقط لأجهزة الكشك المسجَّلة" },
        403
      );
    }

    const { data: workers, error: workersError } = await adminClient
      .from("workers")
      .select("id, username, password_hash, full_name, photo_url, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (workersError) {
      return jsonResponse({ error: "server_error", message: "تعذر تحميل بيانات العمال" }, 500);
    }

    return jsonResponse({ success: true, workers: workers ?? [], synced_at: new Date().toISOString() });
  } catch (err) {
    console.error("kiosk-credentials-sync failed:", err);
    return jsonResponse({ error: "server_error", message: "خطأ غير متوقع" }, 500);
  }
});
