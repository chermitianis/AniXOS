// ============================================================================
// generate-invoice Edge Function
//
// الخطوة الأخيرة في دورة العمل: من مشروع (مكتمل عادة) إلى فاتورة رسمية.
// إن كان المشروع مرتبطاً بعرض سعر مقبول، تُنسخ بنوده حرفياً للفاتورة
// (اتساق تجاري: ما اتُّفق عليه هو ما يُفوتَر). وإلا، بند واحد بقيمة
// quoted_price الخاصة بالمشروع.
// عملية ذرّية كسابقاتها: فشل أي خطوة يُلغي ما قبلها.
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
      return jsonResponse({ error: "unauthorized", message: "يجب تسجيل الدخول أولاً" }, 401);
    }

    const { project_id, invoice_number, due_date } = await req.json();

    if (!project_id || !invoice_number) {
      return jsonResponse({ error: "invalid_input", message: "رقم الفاتورة والمشروع مطلوبان" }, 400);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: companyId, error: companyError } = await callerClient.rpc("get_my_company_id");
    if (companyError || !companyId) {
      return jsonResponse({ error: "unauthorized", message: "تعذر تحديد شركة المستخدم" }, 403);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("*, quotes(id, quote_items(*))")
      .eq("id", project_id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (projectError || !project) {
      return jsonResponse({ error: "not_found", message: "المشروع غير موجود" }, 404);
    }

    if (!project.client_id) {
      return jsonResponse({ error: "no_client", message: "لا يمكن إصدار فاتورة لمشروع بلا عميل مرتبط" }, 400);
    }

    // البحث عن عرض السعر المرتبط بهذا المشروع تحديداً (إن وُجد) لنسخ بنوده
    const linkedQuote = Array.isArray(project.quotes) ? project.quotes[0] : project.quotes;
    const quoteItems = (linkedQuote?.quote_items ?? []) as {
      description: string;
      quantity: number;
      unit_price: number;
    }[];

    let createdInvoiceId: string | null = null;

    try {
      const { data: invoice, error: invoiceError } = await adminClient
        .from("invoices")
        .insert({
          company_id: companyId,
          client_id: project.client_id,
          project_id: project.id,
          quote_id: linkedQuote?.id ?? null,
          invoice_number,
          status: "issued",
          issued_date: new Date().toISOString().slice(0, 10),
          due_date: due_date || null,
        })
        .select()
        .single();

      if (invoiceError || !invoice) {
        throw new Error(invoiceError?.message.includes("duplicate") ? "رقم الفاتورة مستخدم بالفعل" : "تعذر إنشاء الفاتورة");
      }
      createdInvoiceId = invoice.id;

      const itemsToInsert =
        quoteItems.length > 0
          ? quoteItems.map((it, index) => ({
              invoice_id: invoice.id,
              company_id: companyId,
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              sequence_order: index,
            }))
          : [
              {
                invoice_id: invoice.id,
                company_id: companyId,
                description: `مشروع: ${project.name}`,
                quantity: 1,
                unit_price: project.quoted_price ?? 0,
                sequence_order: 0,
              },
            ];

      const { error: itemsError } = await adminClient.from("invoice_items").insert(itemsToInsert);

      if (itemsError) {
        throw new Error("تعذر إضافة بنود الفاتورة");
      }

      return jsonResponse({
        success: true,
        invoice: { id: invoice.id, invoice_number: invoice.invoice_number },
      });
    } catch (innerErr) {
      if (createdInvoiceId) {
        await adminClient.from("invoices").delete().eq("id", createdInvoiceId).catch(() => {});
      }
      throw innerErr;
    }
  } catch (err) {
    console.error("generate-invoice failed:", err);
    const message = err instanceof Error ? err.message : "تعذر إصدار الفاتورة";
    return jsonResponse({ error: "server_error", message }, 500);
  }
});
