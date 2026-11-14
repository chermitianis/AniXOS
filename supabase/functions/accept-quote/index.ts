// ============================================================================
// accept-quote Edge Function
//
// Accepter un devis → créer un Project + Pièces techniques.
// Supporte 2 modes :
//   - Mode Standard : quote_items sans piece_type → 1 pièce par ligne
//   - Mode Hiérarchique : quote_items avec piece_type → parent + enfants
// Si le produit a une nomenclature validée → créer un OF.
// ✅ Nouveau : vérifie si Odoo est actif pour éviter les doublons.
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

    // ✅ 1. التحقق من حالة Odoo
    const { data: odooConfig } = await adminClient
      .from("odoo_config")
      .select("is_active")
      .eq("company_id", companyId)
      .maybeSingle();

    const odooActive = (odooConfig as { is_active: boolean } | null)?.is_active ?? false;

    // 2. جلب الـ Devis + العناصر
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
      id: string;
      description: string;
      quantity: number;
      unit_price: number;
      piece_type?: string;
      parent_item_id?: string | null;
    }[];
    
    const totalAmount = quoteItems.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);

    let createdProjectId: string | null = null;
    let createdOrderId: string | null = null;

    try {
      // 3. إنشاء المشروع
      const { data: project, error: projectError } = await adminClient
      .from("projects")
      .insert({
        company_id: companyId,
        client_id: quote.client_id,
        name: project_name,
        code: null,
        status: "draft",
        quoted_price: totalAmount,
        estimated_cost: null,
        opportunity_id: quote.prospect_id ?? null,
        quote_id: quote.id, // ✅ ربط المشروع بالـ Devis
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

      // 4. إنشاء القطع التقنية (هيكل هرمي: main_product ← technical_pieces)
      const hasPieceType = quoteItems.some((it) => it.piece_type !== undefined);
      
      if (hasPieceType) {
        // ✅ الوضع الجديد: Hierarchical
        const mainProducts = quoteItems.filter((it) => it.piece_type === "main_product");
        const technicalPieces = quoteItems.filter((it) => it.piece_type === "technical_piece");

        let parentPieceId: string | null = null;
        
        for (const mp of mainProducts) {
          const { data: insertedMain, error: mainError } = await adminClient
            .from("pieces_tasks")
            .insert({
              company_id: companyId,
              project_id: project.id,
              name: mp.description,
              quantity: mp.quantity,
              piece_type: "technical_piece",
              status: "pending",
              production_status: "not_sent",
              material: null,
              estimated_time_minutes: null,
              parent_piece_id: null,
            })
            .select("id")
            .single();

          if (!mainError && insertedMain) {
            parentPieceId = (insertedMain as { id: string }).id;
          }
        }

        for (const tp of technicalPieces) {
          await adminClient
            .from("pieces_tasks")
            .insert({
              company_id: companyId,
              project_id: project.id,
              name: tp.description,
              quantity: tp.quantity,
              piece_type: "technical_piece",
              status: "pending",
              production_status: "not_sent",
              material: null,
              estimated_time_minutes: null,
              parent_piece_id: parentPieceId,
            });
        }
      } else {
        // ✅ الوضع القديم: Flat
        for (const item of quoteItems) {
          await adminClient
            .from("pieces_tasks")
            .insert({
              company_id: companyId,
              project_id: project.id,
              name: item.description,
              quantity: item.quantity,
              piece_type: "technical_piece",
              status: "pending",
              production_status: "not_sent",
              material: null,
              estimated_time_minutes: null,
            });
        }
      }

      // ✅ 5. إنشاء OF فقط إذا كان Odoo غير متصل (لتجنب التكرار)
      if (!odooActive) {
        const productNames = quoteItems.map((it) => it.description.trim());
        
        const { data: nomenclatures } = await adminClient
          .from("nomenclatures")
          .select("id, name, project_id, status")
          .eq("company_id", companyId)
          .eq("status", "valide")
          .in("name", productNames);

        if (nomenclatures && nomenclatures.length > 0) {
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

          if (!orderError && order) {
            createdOrderId = order.id;
          }
        }
      }

      // 6. تحديث الـ Devis
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
        odoo_active: odooActive,
        manufacturing_order: createdOrderId ? { id: createdOrderId } : null,
      });
    } catch (innerErr) {
      // Rollback
      if (createdOrderId) {
        await adminClient.from("manufacturing_orders").delete().eq("id", createdOrderId).catch(() => {});
      }
      if (createdProjectId) {
        await adminClient.from("pieces_tasks").delete().eq("project_id", createdProjectId).catch(() => {});
        await adminClient.from("projects").delete().eq("id", createdProjectId).catch(() => {});
      }
      throw innerErr;
    }
  } catch (err) {
    console.error("accept-quote failed:", err);
    const message = err instanceof Error ? err.message : "تعذر قبول عرض السعر";
    return jsonResponse({ error: "server_error", message }, 500);
  }
});