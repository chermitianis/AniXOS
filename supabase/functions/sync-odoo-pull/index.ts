// ============================================================================
// supabase/functions/sync-odoo-pull/index.ts
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("ODOO_ENCRYPTION_KEY") ?? "anixos-odoo-default-key-change-me";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function isPullEnabled(modules: Record<string, unknown> | null | undefined, key: string): boolean {
  if (!modules) return false;
  const value = modules[key];
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "pull" in value) return (value as { pull: boolean }).pull === true;
  return false;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  return await crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptApiKey(encoded: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface OdooContext { url: string; db: string; uid: number; apiKey: string; }

async function odooExecute<T = unknown>(ctx: OdooContext, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
  const endpoint = `${ctx.url.replace(/\/$/, "")}/jsonrpc`;
  const body = JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute_kw", args: [ctx.db, ctx.uid, ctx.apiKey, model, method, args, kwargs] }, id: Date.now() });
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRIES - 1) { await sleep(RETRY_BASE_MS * Math.pow(2, attempt)); lastErr = new Error(`Odoo HTTP ${response.status}`); continue; }
        throw new Error(`Odoo HTTP ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error?.data?.message ?? data.error?.message ?? "Odoo error");
      return data.result as T;
    } catch (err) {
      lastErr = err;
      const isNetwork = err instanceof TypeError || (err instanceof Error && (err.message.includes("fetch") || err.message.includes("aborted")));
      if (!isNetwork || attempt === MAX_RETRIES - 1) throw err;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Odoo request failed");
}

async function authenticateOdoo(url: string, db: string, username: string, apiKey: string): Promise<number> {
  const response = await fetch(`${url.replace(/\/$/, "")}/jsonrpc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "common", method: "authenticate", args: [db, username, apiKey, {}] }, id: 1 }) });
  if (!response.ok) throw new Error(`Odoo HTTP ${response.status}`);
  const data = await response.json();
  if (!data.result) throw new Error("Authentification Odoo échouée");
  return data.result as number;
}

async function fetchAllPages<T = Record<string, unknown>>(ctx: OdooContext, model: string, domain: unknown[], fields: string[], pageSize = 500): Promise<T[]> {
  const all: T[] = []; let offset = 0;
  for (;;) {
    const page = await odooExecute<T[]>(ctx, model, "search_read", [domain], { fields, limit: pageSize, offset });
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// ============================================================================
// Main Handler
// ============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let logId: string | null = null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const cronSecretHeader = req.headers.get("x-cron-secret");
    let companyId: string;
    if (cronSecretHeader) {
      const body = await req.json().catch(() => ({}));
      const bodyCompanyId = (body as { company_id?: string }).company_id;
      if (!bodyCompanyId) return jsonResponse({ error: "missing_company_id" }, 400);
      companyId = bodyCompanyId;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user: callerUser } } = await callerClient.auth.getUser();
      if (!callerUser) return jsonResponse({ error: "unauthorized" }, 401);
      const { data: staff } = await admin.from("staff_users").select("company_id").eq("auth_user_id", callerUser.id).eq("is_owner", true).limit(1).maybeSingle();
      if (!staff) return jsonResponse({ error: "forbidden" }, 403);
      companyId = (staff as { company_id: string }).company_id;
    }

    const { data: config } = await admin.from("odoo_config").select("*").eq("company_id", companyId).eq("is_active", true).maybeSingle();
    if (!config) return jsonResponse({ error: "not_active" }, 400);
    const cfg = config as Record<string, unknown>;

    const { data: logEntry } = await admin.from("odoo_sync_log").insert({ company_id: companyId, direction: "pull", status: "in_progress" }).select().single();
    logId = (logEntry as { id: string } | null)?.id ?? null;

    const apiKey = await decryptApiKey(cfg.api_key_encrypted as string);
    const uid = await authenticateOdoo(cfg.odoo_url as string, cfg.odoo_db as string, cfg.odoo_username as string, apiKey);
    const ctx: OdooContext = { url: cfg.odoo_url as string, db: cfg.odoo_db as string, uid, apiKey };

    const syncModules = (cfg.sync_modules as Record<string, unknown>) ?? {};
    const results: Record<string, number> = {};

    if (isPullEnabled(syncModules, "sales_orders")) {
      const r = await pullSalesOrdersAndManufacturing(ctx, admin, companyId);
      results.sales_quotes = r.quotes;
      results.sales_projects = r.projects;
      results.sales_pieces = r.pieces;
    }

    const totalSynced = Object.values(results).reduce((a, b) => a + b, 0);
    if (logId) await admin.from("odoo_sync_log").update({ status: "success", records_synced: totalSynced, details: results, completed_at: new Date().toISOString() }).eq("id", logId);
    return jsonResponse({ success: true, results, totalSynced });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    if (logId) await admin.from("odoo_sync_log").update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() }).eq("id", logId);
    return jsonResponse({ error: "sync_failed", message: errorMessage }, 500);
  }
});

// ===========================================================================
// سحب أوامر البيع + التصنيع + العمليات (مع الهيكل الهرمي)
// ✅ الآن مع إنشاء Devis (quotes) + quote_items
// ===========================================================================
async function pullSalesOrdersAndManufacturing(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string
): Promise<{ quotes: number; projects: number; pieces: number }> {
  // جلب أوامر البيع المؤكدة (state = 'sale') أو المسودات (state = 'draft')
  const salesOrders = await fetchAllPages(
    ctx,
    "sale.order",
    [["state", "in", ["sale", "draft", "sent"]]],
    ["id", "name", "partner_id", "commitment_date", "date_order", "write_date", "order_line", "client_order_ref", "state"]
  );

  let quotesCount = 0;
  let projectsCount = 0;
  let piecesCount = 0;

  for (const so of salesOrders) {
    const soOdooId = so.id as number;
    const soName = String(so.name ?? `SO-${soOdooId}`);
    const clientOrderRef = (so.client_order_ref as string | null) || null;
    const soState = String(so.state ?? "draft");

    // 1. جلب / إنشاء العميل
    let clientId: string | null = null;
    const partnerField = so.partner_id as [number, string] | false;
    if (partnerField && Array.isArray(partnerField)) {
      const { data: localClient } = await admin
        .from("clients")
        .select("id")
        .eq("company_id", companyId)
        .eq("odoo_id", partnerField[0])
        .maybeSingle();
      
      if (localClient) {
        clientId = (localClient as { id: string }).id;
      } else {
        try {
          const [partner] = await odooExecute<Array<{ name: string; email: string | false; phone: string | false; street: string | false }>>(
            ctx, "res.partner", "read", [[partnerField[0]]], { fields: ["name", "email", "phone", "street"] }
          );
          if (partner) {
            const { data: insertedClient } = await admin.from("clients").insert({
              company_id: companyId,
              name: partner.name,
              email: partner.email || null,
              phone: partner.phone || null,
              address: partner.street || null,
              odoo_id: partnerField[0],
              is_active: true,
            }).select("id").single();
            if (insertedClient) clientId = (insertedClient as { id: string }).id;
          }
        } catch (e) {
          console.warn(`[PULL] Could not create client for SO ${soName}:`, e);
        }
      }
    }

    // 2. تاريخ التسليم
    const rawDueDate = (so.commitment_date as string | null) || (so.date_order as string | null);
    let commitmentDate: string;
    if (rawDueDate) {
      commitmentDate = new Date(rawDueDate).toISOString().split('T')[0];
    } else {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 30);
      commitmentDate = defaultDate.toISOString().split('T')[0];
    }

    // ✅ 3. إنشاء / تحديث Devis (quote) في AniXOS
    // البحث عن quote موجود عبر odoo_reference (رقم Odoo) أو quote_number (إذا تمت المزامنة سابقاً)
    let { data: existingQuote } = await admin
      .from("quotes")
      .select("id, quote_number")
      .eq("company_id", companyId)
      .or(`odoo_reference.eq.${soName},quote_number.eq.${soName}`)
      .maybeSingle();

    let quoteId: string;
    let quoteNumber: string;

    if (existingQuote) {
      quoteId = (existingQuote as { id: string }).id;
      quoteNumber = (existingQuote as { quote_number: string }).quote_number;
      // تحديث الحالة
      await admin.from("quotes").update({
        status: soState === "sale" ? "accepted" : "draft",
        odoo_reference: soName,
      }).eq("id", quoteId);
    } else {
      // إنشاء quote جديد - نستخدم soName كـ quote_number (نفس رقم Odoo)
      const { data: newQuote, error: quoteError } = await admin.from("quotes").insert({
        company_id: companyId,
        client_id: clientId,
        quote_number: soName, // ✅ نفس رقم Odoo
        odoo_reference: soName, // ✅ مرجع Odoo
        client_order_ref: clientOrderRef,
        status: soState === "sale" ? "accepted" : "draft",
        valid_until: commitmentDate,
        created_at: so.date_order || new Date().toISOString(),
      }).select("id, quote_number").single();

      if (quoteError || !newQuote) {
        console.warn(`[PULL] Failed to create quote for SO ${soName}:`, quoteError);
        continue;
      }
      quoteId = (newQuote as { id: string }).id;
      quoteNumber = (newQuote as { quote_number: string }).quote_number;
      quotesCount++;
    }

    // ✅ 4. جلب بنود Sale Order وإنشاؤها في quote_items
    const orderLineIds = so.order_line as number[];
    if (orderLineIds && orderLineIds.length > 0) {
      // حذف البنود القديمة (لإعادة المزامنة)
      await admin.from("quote_items").delete().eq("quote_id", quoteId);

      const lines = await odooExecute<Array<{ id: number; product_id: [number, string] | false; product_uom_qty: number; price_unit: number }>>(
        ctx, "sale.order.line", "read", [orderLineIds], { fields: ["product_id", "product_uom_qty", "price_unit"] }
      );

      const itemRows = lines.map((line, index) => ({
        quote_id: quoteId,
        company_id: companyId,
        description: line.product_id ? line.product_id[1] : `Ligne ${index + 1}`,
        quantity: line.product_uom_qty || 1,
        unit_price: line.price_unit || 0,
        piece_type: "main_product", // ✅ المنتج الرئيسي
        sequence_order: index,
      }));

      if (itemRows.length > 0) {
        await admin.from("quote_items").insert(itemRows);
      }
    }

    // 5. جلب / إنشاء المشروع
    let { data: existingProject } = await admin
      .from("projects")
      .select("id")
      .eq("company_id", companyId)
      .eq("odoo_id", soOdooId)
      .maybeSingle();

    let projectId: string;

    if (existingProject) {
      projectId = (existingProject as { id: string }).id;
      await admin.from("projects").update({
        due_date: commitmentDate,
        status: "approved",
        client_id: clientId,
      }).eq("id", projectId);
    } else {
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const year = String(new Date().getFullYear()).slice(-2);
      const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const generatedCode = `${year}${month}${randomSuffix}`;

      // جلب اسم المنتج من البنود
      let productName = soName;
      if (orderLineIds && orderLineIds.length > 0) {
        try {
          const lines = await odooExecute<Array<{ product_id: [number, string] | false }>>(
            ctx, "sale.order.line", "read", [orderLineIds], { fields: ["product_id"] }
          );
          if (lines.length > 0 && lines[0].product_id) {
            productName = lines[0].product_id[1];
          }
        } catch {}
      }

      const { data: inserted, error } = await admin.from("projects").insert({
        company_id: companyId,
        client_id: clientId,
        name: soName,
        code: generatedCode,
        description: productName,
        status: "approved",
        odoo_id: soOdooId,
        quote_id: quoteId, // ✅ ربط المشروع بالـ Devis
        due_date: commitmentDate,
        last_synced_from: "odoo",
        last_synced_at: new Date().toISOString(),
        odoo_write_date: so.write_date || null,
      }).select("id").single();

      if (error || !inserted) {
        console.warn(`[PULL] Project insert failed for SO ${soName}:`, error);
        continue;
      }
      projectId = (inserted as { id: string }).id;
      projectsCount++;
    }

    // 6. جلب أوامر التصنيع (Main + Sub)
    const mainMos = await fetchAllPages(
      ctx,
      "mrp.production",
      [["origin", "=", soName]],
      ["id", "name", "workorder_ids", "product_qty", "product_id"]
    );

    let subMos: any[] = [];
    for (const mainMo of mainMos) {
      const mainMoName = mainMo.name as string;
      const foundSubMos = await fetchAllPages(
        ctx,
        "mrp.production",
        [["origin", "=", mainMoName]],
        ["id", "name", "workorder_ids", "product_qty", "product_id"]
      );
      subMos.push(...foundSubMos);
    }

    const allMos = [...mainMos, ...subMos].filter(
      (mo, index, self) => self.findIndex((m) => m.id === mo.id) === index
    );

    // 7. معالجة كل أمر تصنيع
    for (const mo of allMos) {
      const moId = mo.id as number;
      const moProductName = mo.product_id
        ? (mo.product_id as [number, string])[1]
        : `MO-${moId}`;

      let { data: existingPiece } = await admin
        .from("pieces_tasks")
        .select("id")
        .eq("company_id", companyId)
        .eq("odoo_id", moId)
        .maybeSingle();

      let parentPieceId: string;

      if (existingPiece) {
        parentPieceId = (existingPiece as { id: string }).id;
        await admin.from("pieces_tasks").update({
          name: moProductName,
          piece_type: "technical_piece",
          quantity: (mo.product_qty as number) || 1,
          project_id: projectId,
        }).eq("id", parentPieceId);
      } else {
        const { data: insertedPiece, error: pieceError } = await admin.from("pieces_tasks").insert({
          company_id: companyId,
          project_id: projectId,
          name: moProductName,
          piece_type: "technical_piece",
          quantity: (mo.product_qty as number) || 1,
          status: "pending",
          production_status: "not_sent",
          odoo_id: moId,
          last_synced_from: "odoo",
          last_synced_at: new Date().toISOString(),
        }).select("id").single();

        if (pieceError || !insertedPiece) {
          console.warn(`[PULL] Piece insert failed for MO ${moId}:`, pieceError);
          continue;
        }
        parentPieceId = (insertedPiece as { id: string }).id;
        piecesCount++;
      }

      // 8. حذف العمليات القديمة وإضافة الجديدة
      const workorderIds = mo.workorder_ids as number[];

      await admin.from("pieces_tasks")
        .delete()
        .eq("company_id", companyId)
        .eq("parent_piece_id", parentPieceId)
        .eq("piece_type", "operation");

      if (workorderIds && workorderIds.length > 0) {
        const workorders = await odooExecute<Array<Record<string, unknown>>>(
          ctx, "mrp.workorder", "read", [workorderIds], { fields: ["id", "name", "duration_expected"] }
        );

        for (const wo of workorders) {
          const woId = wo.id as number;
          const woName = String(wo.name ?? `WO-${woId}`);
          const durationExpectedMinutes = wo.duration_expected ? Math.round(wo.duration_expected as number) : null;

          await admin.from("pieces_tasks").insert({
            company_id: companyId,
            project_id: projectId,
            parent_piece_id: parentPieceId,
            name: woName,
            piece_type: "operation",
            quantity: (mo.product_qty as number) || 1,
            estimated_time_minutes: durationExpectedMinutes,
            status: "pending",
            production_status: "not_sent",
            odoo_workorder_id: woId,
            last_synced_from: "odoo",
            last_synced_at: new Date().toISOString(),
          });
          piecesCount++;
        }
      }
    }
  }

  return { quotes: quotesCount, projects: projectsCount, pieces: piecesCount };
}