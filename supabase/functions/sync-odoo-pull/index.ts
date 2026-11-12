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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

async function odooExecute<T = unknown>(
  ctx: OdooContext, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}
): Promise<T> {
  const endpoint = `${ctx.url.replace(/\/$/, "")}/jsonrpc`;
  const body = JSON.stringify({
    jsonrpc: "2.0", method: "call",
    params: { service: "object", method: "execute_kw", args: [ctx.db, ctx.uid, ctx.apiKey, model, method, args, kwargs] },
    id: Date.now(),
  });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // ✅ إضافة AbortController للتحكم في المهلة (15 ثانية لكل طلب)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(endpoint, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
          lastErr = new Error(`Odoo HTTP ${response.status}`);
          continue;
        }
        throw new Error(`Odoo HTTP ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error?.data?.message ?? data.error?.message ?? "Odoo error");
      return data.result as T;
    } catch (err) {
      lastErr = err;
      const isNetwork = err instanceof TypeError || 
                       (err instanceof Error && (err.message.includes("fetch") || err.message.includes("aborted")));
      if (!isNetwork || attempt === MAX_RETRIES - 1) throw err;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Odoo request failed");
}

async function authenticateOdoo(url: string, db: string, username: string, apiKey: string): Promise<number> {
  const response = await fetch(`${url.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call",
      params: { service: "common", method: "authenticate", args: [db, username, apiKey, {}] }, id: 1,
    }),
  });
  if (!response.ok) throw new Error(`Odoo HTTP ${response.status}`);
  const data = await response.json();
  if (!data.result) throw new Error("Authentification Odoo échouée");
  return data.result as number;
}

async function detectOdooVersion(url: string): Promise<string> {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/jsonrpc`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "common", method: "version", args: [] }, id: 1 }),
    });
    if (!response.ok) return "unknown";
    const data = await response.json();
    return String(data.result?.server_version ?? "unknown");
  } catch { return "unknown"; }
}

async function fetchAllPages<T = Record<string, unknown>>(
  ctx: OdooContext, model: string, domain: unknown[], fields: string[], pageSize = 500
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await odooExecute<T[]>(ctx, model, "search_read", [domain], { fields, limit: pageSize, offset });
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

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
    if (!config) return jsonResponse({ error: "not_active", message: "L'intégration Odoo n'est pas active" }, 400);
    const cfg = config as Record<string, unknown>;

    const { data: logEntry } = await admin.from("odoo_sync_log").insert({ company_id: companyId, direction: "pull", status: "in_progress" }).select().single();
    logId = (logEntry as { id: string } | null)?.id ?? null;

    console.log(`[PULL] Starting for company ${companyId}, logId=${logId}`);

    const apiKey = await decryptApiKey(cfg.api_key_encrypted as string);
    const uid = await authenticateOdoo(cfg.odoo_url as string, cfg.odoo_db as string, cfg.odoo_username as string, apiKey);
    console.log(`[PULL] Authenticated, uid=${uid}`);
    
    const ctx: OdooContext = { url: cfg.odoo_url as string, db: cfg.odoo_db as string, uid, apiKey };

    const detectedVersion = await detectOdooVersion(cfg.odoo_url as string);
    const syncModules = (cfg.sync_modules as Record<string, unknown>) ?? {};
    const results: Record<string, number> = {};

    console.log(`[PULL] sales_orders enabled: ${isPullEnabled(syncModules, "sales_orders")}`);

    if (isPullEnabled(syncModules, "sales_orders")) {
      const r = await pullSalesOrdersAndManufacturing(ctx, admin, companyId);
      results.sales_projects = r.projects;
      results.sales_pieces = r.pieces;
      console.log(`[PULL] Sales orders: projects=${r.projects}, pieces=${r.pieces}`);
    }

    const totalSynced = Object.values(results).reduce((a, b) => a + b, 0);
    const now = new Date().toISOString();

    console.log(`[PULL] Total synced: ${totalSynced}`);

    if (logId) {
      await admin.from("odoo_sync_log").update({ status: "success", records_synced: totalSynced, details: results, completed_at: now }).eq("id", logId);
    }
    await admin.from("odoo_config").update({
      last_sync_at: now, last_sync_status: "success", last_sync_error: null,
      records_synced: ((cfg.records_synced as number) ?? 0) + totalSynced,
      version: (cfg.version as string | null) ?? detectedVersion,
    }).eq("company_id", companyId);

    return jsonResponse({ success: true, results, totalSynced });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[PULL] Failed:", err);
    
    if (logId) {
      try {
        await admin.from("odoo_sync_log").update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() }).eq("id", logId);
      } catch (logErr) {
        console.error("[PULL] Could not update log:", logErr);
      }
    }
    return jsonResponse({ error: "sync_failed", message: errorMessage }, 500);
  }
});

// ===========================================================================
// سحب أوامر البيع + التصنيع + العمليات
// ===========================================================================
async function pullSalesOrdersAndManufacturing(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string
): Promise<{ projects: number; pieces: number }> {

  console.log(`[PULL] Fetching sale orders...`);
  const salesOrders = await fetchAllPages(ctx, "sale.order", [["state", "=", "sale"]],
    ["id", "name", "partner_id", "commitment_date", "write_date"]);

  console.log(`[PULL] Found ${salesOrders.length} sale orders`);

  let projectsCount = 0;
  let piecesCount = 0;

  for (const so of salesOrders) {
    const soOdooId = so.id as number;
    const soName = String(so.name ?? `SO-${soOdooId}`);
    const commitmentDate = (so.commitment_date as string | null) || null;
    
    console.log(`[PULL] Processing SO ${soName} (id=${soOdooId})`);

    let clientId: string | null = null;
    const partnerField = so.partner_id as [number, string] | false;
    if (partnerField && Array.isArray(partnerField)) {
      const { data: localClient } = await admin.from("clients").select("id").eq("company_id", companyId).eq("odoo_id", partnerField[0]).maybeSingle();
      clientId = (localClient as { id: string } | null)?.id ?? null;
    }

    let { data: existingProject } = await admin.from("projects").select("id").eq("company_id", companyId).eq("odoo_id", soOdooId).maybeSingle();
    let projectId: string;

    if (existingProject) {
      projectId = (existingProject as { id: string }).id;
      if (commitmentDate) {
        await admin.from("projects").update({ due_date: commitmentDate }).eq("id", projectId);
      }
      console.log(`[PULL] SO ${soName}: project already exists (id=${projectId})`);
    } else {
      const { data: generated, error: codeError } = await admin.rpc("generate_project_code", { p_company_id: companyId, p_client_id: clientId });
      if (codeError) { 
        console.warn(`[PULL] Code generation failed for SO ${soName}:`, codeError); 
        continue; 
      }

      const { data: inserted, error } = await admin.from("projects").insert({
        company_id: companyId, client_id: clientId, name: soName, code: generated as string,
        status: "approved", odoo_id: soOdooId, due_date: commitmentDate,
        last_synced_from: "odoo", last_synced_at: new Date().toISOString(), odoo_write_date: so.write_date || null,
      }).select("id").single();

      if (error || !inserted) { 
        console.warn(`[PULL] Project insert failed for SO ${soName}:`, error); 
        continue; 
      }
      projectId = (inserted as { id: string }).id;
      projectsCount++;
      console.log(`[PULL] Created project ${projectId} for SO ${soName}`);
    }

    console.log(`[PULL] Fetching MOs for SO ${soName}...`);
    const mos = await fetchAllPages(ctx, "mrp.production", [["origin", "=", soName]],
      ["id", "name", "workorder_ids", "product_qty", "date_deadline"]);

    console.log(`[PULL] Found ${mos.length} MOs for SO ${soName}`);

    for (const mo of mos) {
      const workorderIds = mo.workorder_ids as number[];
      if (!workorderIds || workorderIds.length === 0) continue;

      const workorders = await odooExecute<Array<Record<string, unknown>>>(
        ctx, "mrp.workorder", "read",
        [workorderIds],
        { fields: ["id", "name", "workcenter_id", "duration_expected", "product_id"] }
      );

      for (const wo of workorders) {
        const woOdooId = wo.id as number;
        const woName = String(wo.name ?? `WO-${woOdooId}`);
        const durationExpectedMinutes = wo.duration_expected ? Math.round(wo.duration_expected as number) : null;

        const { data: existingPiece } = await admin.from("pieces_tasks").select("id").eq("company_id", companyId).eq("odoo_workorder_id", woOdooId).maybeSingle();

        if (!existingPiece) {
          const { error: pieceError } = await admin.from("pieces_tasks").insert({
            company_id: companyId,
            project_id: projectId,
            name: woName,
            quantity: (mo.product_qty as number) || 1,
            estimated_time_minutes: durationExpectedMinutes,
            status: "pending",
            production_status: "not_sent",
            odoo_workorder_id: woOdooId,
            odoo_id: woOdooId,
            last_synced_from: "odoo",
            last_synced_at: new Date().toISOString(),
          });
          if (!pieceError) {
            piecesCount++;
            console.log(`[PULL] Created piece for WO ${woOdooId} (${woName})`);
          } else {
            console.warn(`[PULL] Piece insert failed for WO ${woOdooId}:`, pieceError);
          }
        } else {
          await admin.from("pieces_tasks").update({
            estimated_time_minutes: durationExpectedMinutes,
            last_synced_from: "odoo",
            last_synced_at: new Date().toISOString(),
          }).eq("id", (existingPiece as { id: string }).id);
        }
      }
    }
  }

  return { projects: projectsCount, pieces: piecesCount };
}