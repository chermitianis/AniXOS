// ============================================================================
// register-device Edge Function
//
// يُستدعى مرة واحدة فقط لكل جهاز فعلي، من موظف مسجّل دخول (owner تحديداً
// لأجهزة Kiosk، لأنها ستحصل على حساب Auth دائم يصل لبيانات كل عمال الشركة).
//
// device_mode = 'admin'  → صف تسجيلي فقط، بلا حساب Auth خاص (الموظف يسجّل
//                           دخوله بنفسه في كل مرة بحسابه الشخصي)
// device_mode = 'kiosk'  → يُنشأ حساب Auth مخصص للجهاز نفسه، وتُعاد بيانات
//                           الدخول (مرة واحدة فقط) ليُبدِّل المتصفح جلسته
//                           إليها فوراً ويحتفظ بها بشكل دائم على ذلك الجهاز
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

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized", message: "يجب تسجيل الدخول كموظف أولاً" }, 401);
    }

    const { device_name, device_mode } = await req.json();

    if (!device_name || !["admin", "kiosk"].includes(device_mode)) {
      return jsonResponse({ error: "invalid_input", message: "بيانات الجهاز غير صحيحة" }, 400);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
    } = await callerClient.auth.getUser();

    if (!callerUser) {
      return jsonResponse({ error: "unauthorized", message: "جلسة غير صالحة" }, 401);
    }

    const { data: callerStaff, error: staffError } = await callerClient
      .from("staff_users")
      .select("company_id, is_owner")
      .eq("id", callerUser.id)
      .single();

    if (staffError || !callerStaff) {
      return jsonResponse({ error: "forbidden", message: "المستخدم ليس موظفاً في أي شركة" }, 403);
    }

    // تسجيل جهاز Kiosk يمنحه صلاحية الوصول لبيانات دخول كل العمال (عبر
    // kiosk-credentials-sync لاحقاً)، لذا نقصر هذا الإجراء على المالك فقط
    if (device_mode === "kiosk" && !callerStaff.is_owner) {
      return jsonResponse(
        { error: "forbidden", message: "فقط مالك الشركة يمكنه تسجيل جهاز كشك جديد" },
        403
      );
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (device_mode === "admin") {
      const { data: device, error: deviceError } = await adminClient
        .from("devices")
        .insert({
          company_id: callerStaff.company_id,
          device_name,
          device_mode: "admin",
        })
        .select()
        .single();

      if (deviceError) {
        return jsonResponse({ error: "server_error", message: "تعذر تسجيل الجهاز" }, 500);
      }

      return jsonResponse({ success: true, device: { id: device.id, mode: "admin" } });
    }

    // ------------------------------------------------------------------
    // device_mode === "kiosk"
    // ------------------------------------------------------------------
    const deviceEmail = `device-${crypto.randomUUID()}@device.anixos.internal`;
    const devicePassword = randomPassword();

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: deviceEmail,
      password: devicePassword,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      return jsonResponse({ error: "server_error", message: "تعذر إنشاء حساب الجهاز" }, 500);
    }

    const { data: device, error: deviceError } = await adminClient
      .from("devices")
      .insert({
        company_id: callerStaff.company_id,
        auth_user_id: authData.user.id,
        device_name,
        device_mode: "kiosk",
      })
      .select()
      .single();

    if (deviceError) {
      await adminClient.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return jsonResponse({ error: "server_error", message: "تعذر تسجيل الجهاز" }, 500);
    }

    // نُعيد بيانات دخول حساب الجهاز مرة واحدة فقط؛ المتصفح يجب أن يُبدِّل
    // جلسته إليها فوراً بعد استلام هذه الاستجابة ولا يُخزِّنها بأي شكل آخر
    return jsonResponse({
      success: true,
      device: { id: device.id, mode: "kiosk" },
      device_credentials: { email: deviceEmail, password: devicePassword },
    });
  } catch (err) {
    console.error("register-device failed:", err);
    return jsonResponse({ error: "server_error", message: "خطأ غير متوقع" }, 500);
  }
});
