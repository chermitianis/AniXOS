import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ODOO_WEBHOOK_SECRET") ?? "anixos-webhook-secret";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // 1. التحقق من الأمان (Secret)
  const authHeader = req.headers.get("x-webhook-secret");
  if (authHeader !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    const body = await req.json();
    // Odoo يرسل: { model: 'project.project', record_id: 123, company_id: 'uuid' }
    const { company_id } = body;

    if (!company_id) return new Response("Missing company_id", { status: 400 });

    // 2. استدعاء دالة المزامنة فوراً (في الخلفية)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    // نستخدم الدالة التي أنشأناها في SQL (0097) لتشغيل Pull فوراً
    await admin.rpc("trigger_odoo_pull", { p_company_id: company_id });

    return new Response(JSON.stringify({ success: true, message: "Sync triggered" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
