// ============================================================================
// supabase/functions/sync-odoo-push/index.ts
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

function isPushEnabled(modules: Record<string, unknown> | null | undefined, key: string): boolean {
  if (!modules) return false;
  const value = modules[key];
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "push" in value) return (value as { push: boolean }).push === true;
  return false;
}

async function decryptApiKey(encoded: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const key = await crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
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
  const body = JSON.stringify({
    jsonrpc: "2.0", method: "call",
    params: { service: "object", method: "execute_kw", args: [ctx.db, ctx.uid, ctx.apiKey, model, method, args, kwargs] },
    id: Date.now(),
  });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // ✅ إضافة AbortController للتحكم في المهلة
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
        if (response.status === 429) {
          const waitTime = RETRY_BASE_MS * Math.pow(2, attempt) * 2;
          await sleep(waitTime);
          lastErr = new Error(`Odoo HTTP 429`);
          continue;
        }
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

const DONE_STAGE_NAMES = ["Terminé", "Terminée", "Termine", "Done", "Completed", "Finished", "Fait", "Clôturé", "منتهية", "مكتملة", "منجز", "OK"];
async function resolveDoneStageId(ctx: OdooContext, admin: ReturnType<typeof createClient>, companyId: string, currentMappings: Record<string, unknown>): Promise<number | null> {
  let mappings: Record<string, { name: string; sequence?: number }> = (currentMappings as any) ?? {};
  if (Object.keys(mappings).length === 0) {
    const stages = await odooExecute<Array<{ id: number; name: string; sequence: number }>>(ctx, "project.task.type", "search_read", [[]], { fields: ["id", "name", "sequence"] });
    mappings = {};
    for (const s of stages) mappings[String(s.id)] = { name: s.name, sequence: s.sequence };
    await admin.from("odoo_config").update({ stage_mappings: mappings }).eq("company_id", companyId);
  }
  for (const [id, meta] of Object.entries(mappings)) {
    if (DONE_STAGE_NAMES.some((candidate) => meta.name.toLowerCase().includes(candidate.toLowerCase()))) return Number(id);
  }
  return null;
}

// ✅ دالة لتنسيق التاريخ بالصيغة التي يقبلها Odoo
function formatOdooDate(isoString: string | null): string {
  if (!isoString) return new Date().toISOString().replace('T', ' ').split('.')[0];
  const date = new Date(isoString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let logId: string | null = null;

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
      const { data: { user } } = await callerClient.auth.getUser();
      if (!user) return jsonResponse({ error: "unauthorized" }, 401);
      const { data: staff } = await admin.from("staff_users").select("company_id").eq("auth_user_id", user.id).eq("is_owner", true).limit(1).maybeSingle();
      if (!staff) return jsonResponse({ error: "forbidden" }, 403);
      companyId = (staff as { company_id: string }).company_id;
    }

    const { data: config } = await admin.from("odoo_config").select("*").eq("company_id", companyId).eq("is_active", true).maybeSingle();
    if (!config) return jsonResponse({ error: "not_active", message: "L'intégration Odoo n'est pas active" }, 400);
    const cfg = config as Record<string, unknown>;

    const { data: logEntry } = await admin.from("odoo_sync_log").insert({ company_id: companyId, direction: "push", status: "in_progress" }).select().single();
    logId = (logEntry as { id: string } | null)?.id ?? null;

    console.log(`[PUSH] Starting for company ${companyId}, logId=${logId}`);

    const apiKey = await decryptApiKey(cfg.api_key_encrypted as string);
    const uid = await authenticateOdoo(cfg.odoo_url as string, cfg.odoo_db as string, cfg.odoo_username as string, apiKey);
    console.log(`[PUSH] Authenticated, uid=${uid}`);
    
    const ctx: OdooContext = { url: cfg.odoo_url as string, db: cfg.odoo_db as string, uid, apiKey };

    const detectedVersion = await detectOdooVersion(cfg.odoo_url as string);
    const since = (cfg.last_push_at as string | null) ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const syncModules = (cfg.sync_modules as Record<string, unknown>) ?? {};
    const results: Record<string, number> = {};

    const doneStageId = await resolveDoneStageId(ctx, admin, companyId, (cfg.stage_mappings as Record<string, unknown>) ?? {});

    if (isPushEnabled(syncModules, "work_orders")) {
      results.tasksStatusUpdated = await pushTaskStatus(ctx, admin, companyId, doneStageId, since);
    }
    results.workorderTimesPushed = await pushTimesheetsToWorkOrder(ctx, admin, companyId);
    results.timesheetsCreated = await pushTimesheetsToAnalytic(ctx, admin, companyId);

    const totalSynced = Object.values(results).reduce((a, b) => a + b, 0);
    const now = new Date().toISOString();

    console.log(`[PUSH] Results:`, results);

    if (logId) await admin.from("odoo_sync_log").update({ status: "success", records_synced: totalSynced, details: results, completed_at: now }).eq("id", logId);

    await admin.from("odoo_config").update({
      last_sync_at: now, last_push_at: now, last_sync_status: "success", last_sync_error: null,
      records_synced: ((cfg.records_synced as number) ?? 0) + totalSynced,
      version: (cfg.version as string | null) ?? detectedVersion,
    }).eq("company_id", companyId);

    return jsonResponse({ success: true, results, totalSynced });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[PUSH] Failed:", err);
    if (logId) {
      try {
        await admin.from("odoo_sync_log").update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() }).eq("id", logId);
      } catch (logErr) {
        console.error("[PUSH] Could not update log:", logErr);
      }
    }
    return jsonResponse({ error: "sync_failed", message: errorMessage }, 500);
  }
});

// ===========================================================================
// إرسال الوقت الفعلي إلى mrp.workcenter.productivity
// ===========================================================================
async function pushTimesheetsToWorkOrder(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string
): Promise<number> {
  console.log(`[PUSH] === Starting pushTimesheetsToWorkOrder for company ${companyId} ===`);
  
  const { data: pieces, error: piecesError } = await admin
    .from("pieces_tasks")
    .select("id, name, odoo_workorder_id, project_id, quantity")
    .eq("company_id", companyId)
    .not("odoo_workorder_id", "is", null);

  if (piecesError) {
    console.error(`[PUSH] Error fetching pieces:`, piecesError);
    return 0;
  }

  console.log(`[PUSH] Found ${pieces?.length ?? 0} pieces with odoo_workorder_id`);

  if (!pieces || pieces.length === 0) {
    console.log(`[PUSH] No pieces to process. Exiting.`);
    return 0;
  }

  let pushed = 0;

  for (const piece of pieces) {
    console.log(`[PUSH] --- Processing piece ${piece.id} (${piece.name}, WO=${piece.odoo_workorder_id}) ---`);

    const { data: sessions, error: sessionsError } = await admin
      .from("work_sessions")
      .select("id, worker_id, started_at, ended_at, duration_seconds, odoo_productivity_id")
      .eq("piece_task_id", piece.id)
      .is("voided_at", null)
      .order("started_at", { ascending: true });

    if (sessionsError) {
      console.error(`[PUSH] Error fetching sessions for piece ${piece.id}:`, sessionsError);
      continue;
    }

    console.log(`[PUSH] Found ${sessions?.length ?? 0} sessions for piece ${piece.id}`);

    if (!sessions || sessions.length === 0) {
      console.log(`[PUSH] No sessions for piece ${piece.id}. Skipping.`);
      continue;
    }

    for (const session of sessions) {
      console.log(`[PUSH] Session ${session.id}: duration=${session.duration_seconds}s, odoo_productivity_id=${session.odoo_productivity_id}`);

      if (session.odoo_productivity_id && session.odoo_productivity_id > 0) {
        console.log(`[PUSH] Session ${session.id} already pushed. Skipping.`);
        continue;
      }

      const { data: worker, error: workerError } = await admin
        .from("workers")
        .select("odoo_id, full_name")
        .eq("id", session.worker_id)
        .single();

      if (workerError || !worker?.odoo_id) {
        console.warn(`[PUSH] Worker ${session.worker_id} not linked to Odoo. Skipping session ${session.id}.`);
        continue;
      }

      console.log(`[PUSH] Worker: ${worker.full_name} (odoo_id=${worker.odoo_id})`);

      let totalSeconds = session.duration_seconds;
      if (!totalSeconds && session.started_at && session.ended_at) {
        totalSeconds = Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000);
      }

      if (!totalSeconds || totalSeconds <= 0) {
        console.warn(`[PUSH] Session ${session.id} has invalid duration (${totalSeconds}). Skipping.`);
        continue;
      }

      const minutes = Math.round(totalSeconds / 60);
      if (minutes <= 0) {
        console.warn(`[PUSH] Session ${session.id} has duration less than 1 minute. Skipping.`);
        continue;
      }

      try {
        console.log(`[PUSH] Creating mrp.workcenter.productivity for WO ${piece.odoo_workorder_id} (${minutes} min)`);
        
        // 1. جلب workcenter_id من mrp.workorder
        const workorderData = await odooExecute<Array<{ workcenter_id: [number, string] | false }>>(
          ctx, "mrp.workorder", "read",
          [[piece.odoo_workorder_id]],
          { fields: ["workcenter_id"] }
        );

        let workcenterId: number | false = false;
        if (workorderData && workorderData.length > 0 && workorderData[0].workcenter_id) {
          workcenterId = (workorderData[0].workcenter_id as [number, string])[0];
        }

        if (!workcenterId) {
          console.warn(`[PUSH] No workcenter_id found for WO ${piece.odoo_workorder_id}. Skipping.`);
          continue;
        }

        // ✅ جلب loss_id (سبب الخسارة) المناسب للوقت الإنتاجي
        let lossId: number | false = false;
        try {
          // البحث عن "Productive Time" أو أي سبب افتراضي
          const losses = await odooExecute<Array<{ id: number; name: string }>>(
            ctx, "mrp.workcenter.productivity.loss", "search_read",
            [[["loss_type", "=", "productive"]]],
            { fields: ["id", "name"], limit: 1 }
          );
          
          if (losses && losses.length > 0) {
            lossId = losses[0].id;
            console.log(`[PUSH] Using loss_id=${lossId} (${losses[0].name})`);
          } else {
            // إذا لم نجد "productive"، نأخذ أي سبب متاح
            const anyLoss = await odooExecute<Array<{ id: number; name: string }>>(
              ctx, "mrp.workcenter.productivity.loss", "search_read",
              [[]],
              { fields: ["id", "name"], limit: 1 }
            );
            if (anyLoss && anyLoss.length > 0) {
              lossId = anyLoss[0].id;
              console.log(`[PUSH] Using fallback loss_id=${lossId} (${anyLoss[0].name})`);
            }
          }
        } catch (lossErr) {
          console.warn(`[PUSH] Could not fetch loss_id:`, lossErr);
        }

        if (!lossId) {
          console.warn(`[PUSH] No loss_id available. Skipping session ${session.id}.`);
          continue;
        }

        // 2. إنشاء productivity مع كل الحقول الإلزامية
        const productivityId = await odooExecute<number>(
          ctx, "mrp.workcenter.productivity", "create",
          [{
            workorder_id: piece.odoo_workorder_id,
            workcenter_id: workcenterId,
            loss_id: lossId,  // ✅ الحقل الإلزامي الجديد
            employee_id: worker.odoo_id,
            date_start: formatOdooDate(session.started_at),
            date_end: formatOdooDate(session.ended_at),
            duration: minutes,
            description: `AniXOS Session - ${piece.name}`,
          }]
        );
        console.log(`[PUSH] Odoo returned productivityId=${productivityId}`);

        if (productivityId && productivityId > 0) {
          await admin.from("work_sessions").update({ odoo_productivity_id: productivityId }).eq("id", session.id);
          pushed++;
          console.log(`[PUSH] ✅ Successfully pushed session ${session.id} (productivityId=${productivityId})`);
        } else {
          console.warn(`[PUSH] Odoo returned invalid productivityId: ${productivityId}`);
        }
      } catch (e) {
        console.error(`[PUSH] ❌ FAILED to push session ${session.id}:`, e);
      }
    }
  }

  console.log(`[PUSH] === Finished. Total pushed: ${pushed} ===`);
  return pushed;
}
// ===========================================================================
// إرسال حالة المهمة إلى project.task
// ===========================================================================
async function pushTaskStatus(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
  doneStageId: number | null,
  since: string
): Promise<number> {
  if (!doneStageId) return 0;

  const { data: pieces } = await admin
    .from("pieces_tasks")
    .select("id, name, status, odoo_id, project_id, completed_at, updated_at, manufacturing_order_id")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .not("odoo_id", "is", null)
    .gte("updated_at", since);

  if (!pieces || pieces.length === 0) return 0;

  let updated = 0;
  for (const piece of pieces) {
    const odooTaskId = piece.odoo_id as number;
    const manufacturingOrderId = piece.manufacturing_order_id as string | null;

    let allPackagesCompleted = true;
    if (manufacturingOrderId) {
      const { data: wps } = await admin.from("of_work_packages").select("id, status").eq("company_id", companyId).eq("manufacturing_order_id", manufacturingOrderId);
      if (wps && wps.length > 0) {
        allPackagesCompleted = wps.every((wp) => wp.status === "completed");
        if (!allPackagesCompleted) continue;
      }
    }

    const { data: sessions } = await admin.from("work_sessions").select("duration_seconds").eq("piece_task_id", piece.id as string).is("voided_at", null).not("duration_seconds", "is", null);
    const totalSeconds = (sessions ?? []).reduce((sum, s) => sum + ((s.duration_seconds as number) || 0), 0);
    const effectiveHours = totalSeconds > 0 ? Number((totalSeconds / 3600).toFixed(2)) : 0;

    try {
      await odooExecute(ctx, "project.task", "write", [
        [odooTaskId],
        { stage_id: doneStageId, effective_hours: effectiveHours, remaining_hours: 0 }
      ]);
      updated++;
    } catch (e) { 
      console.warn(`[PUSH] pushTaskStatus failed for task ${odooTaskId}:`, e); 
    }
  }

  return updated;
}

// ===========================================================================
// إرسال الوقت إلى account.analytic.line (Timesheets)
// ===========================================================================
async function pushTimesheetsToAnalytic(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string
): Promise<number> {
  const { data: queueItems } = await admin.from("odoo_sync_queue").select("id, piece_task_id").eq("company_id", companyId).eq("status", "pending").order("created_at", { ascending: true }).limit(5);
  if (!queueItems || queueItems.length === 0) return 0;

  let pushed = 0;

  for (const item of queueItems) {
    const { data: claimed } = await admin.from("odoo_sync_queue").update({ status: "processing" }).eq("id", item.id).eq("status", "pending").select("id").maybeSingle();
    if (!claimed) continue;

    try {
      const { data: piece } = await admin.from("pieces_tasks").select("id, name, project_id, odoo_id").eq("id", item.piece_task_id).single();
      if (!piece?.odoo_id) throw new Error("Piece not linked to Odoo");

      const { data: project } = await admin.from("projects").select("odoo_id").eq("id", piece.project_id).single();
      if (!project?.odoo_id) throw new Error("Project not linked to Odoo");

      const { data: sessions } = await admin.from("work_sessions").select("id, worker_id, started_at, ended_at, duration_seconds, odoo_timesheet_id").eq("piece_task_id", piece.id).is("voided_at", null).order("started_at", { ascending: true });
      if (!sessions || sessions.length === 0) {
        await admin.from("odoo_sync_queue").update({ status: "success", processed_at: new Date().toISOString() }).eq("id", item.id);
        continue;
      }

      let sessionIndex = 1;
      for (const session of sessions) {
        if (session.odoo_timesheet_id && session.odoo_timesheet_id > 0) { sessionIndex++; continue; }

        const { data: worker } = await admin.from("workers").select("odoo_id, full_name").eq("id", session.worker_id).single();
        if (!worker?.odoo_id) { sessionIndex++; continue; }

        let totalSeconds = session.duration_seconds;
        if (!totalSeconds && session.started_at && session.ended_at) {
          totalSeconds = Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000);
        }
        const hours = Number((totalSeconds || 0) / 3600);
        if (hours <= 0) { sessionIndex++; continue; }

        const dateStr = new Date(session.started_at).toISOString().split('T')[0];
        const isLastSession = sessionIndex === sessions.length;
        const sessionLabel = isLastSession ? `Session ${sessionIndex} (Terminé)` : `Session ${sessionIndex}`;
        const description = `${piece.name} - ${worker.full_name} - ${sessionLabel}`;

        const existingLines = await odooExecute<number[]>(ctx, "account.analytic.line", "search", [[
          ["task_id", "=", piece.odoo_id], ["employee_id", "=", worker.odoo_id], ["name", "=", description], ["date", "=", dateStr]
        ]]);

        if (existingLines.length > 0) {
          await admin.from("work_sessions").update({ odoo_timesheet_id: existingLines[0] }).eq("id", session.id);
        } else {
          const odooTimesheetId = await odooExecute<number>(ctx, "account.analytic.line", "create", [{
            name: description, project_id: project.odoo_id, task_id: piece.odoo_id,
            employee_id: worker.odoo_id, unit_amount: hours, date: dateStr
          }]);
          if (odooTimesheetId && odooTimesheetId > 0) {
            await admin.from("work_sessions").update({ odoo_timesheet_id: odooTimesheetId }).eq("id", session.id);
          }
        }
        sessionIndex++;
      }

      await admin.from("odoo_sync_queue").update({ status: "success", processed_at: new Date().toISOString() }).eq("id", item.id);
      pushed++;
    } catch (e) {
      const attempts = ((item as any).attempts || 0) + 1;
      const newStatus = attempts >= 3 ? "failed" : "pending";
      await admin.from("odoo_sync_queue").update({ status: newStatus, attempts, error_message: String(e) }).eq("id", item.id);
      console.warn(`[PUSH] Queue item ${item.id} failed:`, e);
    }
  }

  return pushed;
}