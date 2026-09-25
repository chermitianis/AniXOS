// ============================================================================
// accept-quote Edge Function
//
// Accepter un devis → créer un Project en 'draft' + un Manufacturing Order
// initial. Le projet entre automatiquement dans le workflow Ingénierie.
// Le code (PRJ-YYYY-NNNN) est généré par le trigger DB.
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

    const { quote_id, project_name } = await req.json();

    if (!quote_id || !project_name) {
      return jsonResponse(
        { error: "invalid_input", message: "quote_id et project_name requis" },
        400,
      );
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: companyId, error: companyError } = await callerClient.rpc("get_my_company_id");
    if (companyError || !companyId) {
      return jsonResponse(
        { error: "unauthorized", message: "تعذر تحديد شركة المستخدم" },
        403,
      );
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Récupérer le devis + items
    const { data: quote, error: quoteError } = await adminClient
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", quote_id)
      .eq("company_id", companyId)
      .single();

    if (quoteError || !quote) {
      return jsonResponse({ error: "not_found", message: "عرض السعر غير موجود" }, 404);
    }

    if (quote.status === "accepted") {
      return jsonResponse(
        { error: "already_accepted", message: "هذا العرض مقبول بالفعل" },
        409,
      );
    }

    const quoteItems = (quote.quote_items ?? []) as {
      quantity: number;
      unit_price: number;
      description: string;
    }[];
    const totalAmount = quoteItems.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);

    let createdProjectId: string | null = null;
    let createdOrderId: string | null = null;

    try {
      // 2) Créer le projet — démarre en 'draft', entre dans Ingénierie
      const { data: project, error: projectError } = await adminClient
        .from("projects")
        .insert({
          company_id: companyId,
          client_id: quote.client_id,
          name: project_name,
          code: null,                                 // ← trigger 0077 le génère
          status: "draft",                            // ← entre dans Ingénierie
          quoted_price: totalAmount,                  // ← prix convenu
          estimated_cost: null,                       // ← sera calculé en Ingénierie
          opportunity_id: quote.prospect_id ?? null,
        })
        .select()
        .single();

      if (projectError || !project) {
        throw new Error(
          projectError?.message.includes("duplicate")
            ? "كود المشروع مستخدم بالفعل"
            : "تعذر إنشاء المشروع",
        );
      }
      createdProjectId = project.id;

      // 3) Créer un ordre de fabrication initial
      const firstItemDescription = quoteItems[0]?.description ?? project_name;

      const { data: order, error: orderError } = await adminClient
        .from("manufacturing_orders")
        .insert({
          company_id: companyId,
          project_id: project.id,
          quote_id: quote.id,
          order_number: `MO-${quote.quote_number}`,
          product_name: firstItemDescription,
          quantity: 1,
          status: "confirmed",
        })
        .select()
        .single();

      if (orderError || !order) {
        throw new Error("تعذر إنشاء أمر التصنيع");
      }
      createdOrderId = order.id;

      // 4) Marquer le devis comme accepté
      const { error: updateQuoteError } = await adminClient
        .from("quotes")
        .update({ status: "accepted", project_id: project.id })
        .eq("id", quote.id);

      if (updateQuoteError) {
        throw new Error("تعذر تحديث حالة عرض السعر");
      }

      return jsonResponse({
        success: true,
        project: { id: project.id, name: project.name, code: project.code },
        manufacturing_order: { id: order.id, order_number: order.order_number },
      });
    } catch (innerErr) {
      // Rollback manuel
      if (createdOrderId) {
        await adminClient
          .from("manufacturing_orders")
          .delete()
          .eq("id", createdOrderId)
          .catch(() => {});
      }
      if (createdProjectId) {
        await adminClient
          .from("projects")
          .delete()
          .eq("id", createdProjectId)
          .catch(() => {});
      }
      throw innerErr;
    }
  } catch (err) {
    console.error("accept-quote failed:", err);
    const message = err instanceof Error ? err.message : "تعذر قبول عرض السعر";
    return jsonResponse({ error: "server_error", message }, 500);
  }
});