// ============================================================================
// supabase/functions/sync-odoo-push/index.ts
//
// Unified Push — Final Version.
//
// Handles:
//   1. Mirror Creation: Creates clients, projects, and tasks in Odoo if they
//      were created in AniXOS (odoo_id IS NULL).
//   2. Smart Timesheets: Reads `activity_log` to find "start" and "terminer"
//      events for each piece, calculates the exact duration, and sends it
//      to Odoo grouped by worker.
//   3. Task Status: Updates the Odoo Task to "Done" when the piece is completed.
//   4. Production Reports: Posts an HTML summary message on the Odoo Project.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_KEY =
  Deno.env.get("ODOO_ENCRYPTION_KEY") ?? "anixos-odoo-default-key-change-me";
const CRON_INTERNAL_SECRET = Deno.env.get("CRON_INTERNAL_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------
async function decryptApiKey(encoded: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// Odoo JSON-RPC with retry
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface OdooContext {
  url: string;
  db: string;
  uid: number;
  apiKey: string;
}

async function odooExecute<T = unknown>(
  ctx: OdooContext,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const endpoint = `${ctx.url.replace(/\/$/, "")}/jsonrpc`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ctx.db, ctx.uid, ctx.apiKey, model, method, args, kwargs],
    },
    id: Date.now(),
  });

  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
          lastErr = new Error(`Odoo HTTP ${response.status}`);
          continue;
        }
        throw new Error(`Odoo HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        const msg =
          data.error?.data?.message ?? data.error?.message ?? "Odoo error";
        throw new Error(msg);
      }
      return data.result as T;
    } catch (err) {
      lastErr = err;
      const isNetwork =
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"));
      if (!isNetwork || attempt === MAX_RETRIES - 1) throw err;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Odoo request failed");
}

// ---------------------------------------------------------------------------
// Authentication & version
// ---------------------------------------------------------------------------
async function authenticateOdoo(
  url: string,
  db: string,
  username: string,
  apiKey: string,
): Promise<number> {
  const response = await fetch(`${url.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [db, username, apiKey, {}],
      },
      id: 1,
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service: "common", method: "version", args: [] },
        id: 1,
      }),
    });
    if (!response.ok) return "unknown";
    const data = await response.json();
    return String(data.result?.server_version ?? "unknown");
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Stage mapping resolution
// ---------------------------------------------------------------------------
interface StageMapping {
  [stageId: string]: { name: string; sequence?: number };
}

const DONE_STAGE_NAMES = [
  "Terminé", "Terminée", "Termine",
  "Done", "Completed", "Finished",
  "Fait", "Clôturé",
  "منتهية", "مكتملة", "منجز",
  "OK",
];

async function resolveDoneStageId(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
  currentMappings: StageMapping,
): Promise<number | null> {
  let mappings = currentMappings;

  if (Object.keys(mappings).length === 0) {
    try {
      const stages = await odooExecute<
        Array<{ id: number; name: string; sequence: number }>
      >(ctx, "project.task.type", "search_read", [[]], {
        fields: ["id", "name", "sequence"],
      });

      mappings = {};
      for (const s of stages) {
        mappings[String(s.id)] = { name: s.name, sequence: s.sequence };
      }

      await admin
        .from("odoo_config")
        .update({ stage_mappings: mappings })
        .eq("company_id", companyId);
    } catch (err) {
      console.warn("resolveDoneStageId: failed to fetch stages", err);
      return null;
    }
  }

  for (const [id, meta] of Object.entries(mappings)) {
    const name = meta.name ?? "";
    if (
      DONE_STAGE_NAMES.some((candidate) =>
        name.toLowerCase().includes(candidate.toLowerCase()),
      )
    ) {
      return Number(id);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 1) Mirror creation — clients
// ---------------------------------------------------------------------------
async function pushMissingClients(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const { data: localClients } = await admin
    .from("clients")
    .select("id, name, email, phone, address")
    .eq("company_id", companyId)
    .is("odoo_id", null)
    .eq("is_active", true);

  let created = 0;
  for (const c of (localClients ?? []) as Array<Record<string, unknown>>) {
    try {
      const odooId = await odooExecute<number>(ctx, "res.partner", "create", [
        {
          name: String(c.name ?? ""),
          email: c.email || false,
          phone: c.phone || false,
          street: c.address || false,
          customer_rank: 1,
        },
      ]);
      await admin
        .from("clients")
        .update({ odoo_id: odooId })
        .eq("id", c.id as string);
      created++;
    } catch (e) {
      console.warn("pushMissingClients failed for", c.id, e);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// 2) Mirror creation — projects
// ---------------------------------------------------------------------------
async function pushMissingProjects(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const { data: localProjects } = await admin
    .from("projects")
    .select("id, name, client_id, start_date, due_date")
    .eq("company_id", companyId)
    .is("odoo_id", null)
    .eq("is_archived", false);

  let created = 0;
  for (const p of (localProjects ?? []) as Array<Record<string, unknown>>) {
    try {
      let odooPartnerId: number | false = false;
      if (p.client_id) {
        const { data: client } = await admin
          .from("clients")
          .select("odoo_id")
          .eq("id", p.client_id as string)
          .maybeSingle();
        const clientOdooId = (client as { odoo_id: number | null } | null)
          ?.odoo_id;
        if (clientOdooId) odooPartnerId = clientOdooId;
      }

      const odooId = await odooExecute<number>(
        ctx,
        "project.project",
        "create",
        [
          {
            name: String(p.name ?? ""),
            partner_id: odooPartnerId,
            date_start: p.start_date || false,
            date: p.due_date || false,
          },
        ],
      );
      await admin
        .from("projects")
        .update({ odoo_id: odooId })
        .eq("id", p.id as string);
      created++;
    } catch (e) {
      console.warn("pushMissingProjects failed for", p.id, e);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// 3) Mirror creation — pieces (project.task)
// ---------------------------------------------------------------------------
async function pushMissingPieces(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const { data: linkedProjects } = await admin
    .from("projects")
    .select("id, odoo_id")
    .eq("company_id", companyId)
    .not("odoo_id", "is", null)
    .eq("is_archived", false);

  const projects = (linkedProjects ?? []) as Array<{
    id: string;
    odoo_id: number;
  }>;
  if (projects.length === 0) return 0;

  const projectByLocalId = new Map(projects.map((p) => [p.id, p.odoo_id]));

  const { data: localPieces } = await admin
    .from("pieces_tasks")
    .select("id, name, project_id, estimated_time_minutes")
    .eq("company_id", companyId)
    .is("odoo_id", null)
    .in(
      "project_id",
      projects.map((p) => p.id),
    );

  let created = 0;
  for (const piece of (localPieces ?? []) as Array<Record<string, unknown>>) {
    const odooProjectId = projectByLocalId.get(piece.project_id as string);
    if (!odooProjectId) continue;

    try {
      const payload: Record<string, unknown> = {
        name: String(piece.name ?? ""),
        project_id: odooProjectId,
      };

      const minutes = piece.estimated_time_minutes as number | null;
      if (minutes && minutes > 0) {
        payload.planned_hours = minutes / 60;
      }

      const odooId = await odooExecute<number>(
        ctx,
        "project.task",
        "create",
        [payload],
      );
      await admin
        .from("pieces_tasks")
        .update({ odoo_id: odooId })
        .eq("id", piece.id as string);
      created++;
    } catch (e) {
      console.warn("pushMissingPieces failed for", piece.id, e);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// 4) Task status write-back — project.task.write
// ---------------------------------------------------------------------------
async function pushTaskStatus(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
  doneStageId: number | null,
  since: string,
): Promise<number> {
  if (!doneStageId) {
    console.warn("pushTaskStatus: no 'done' stage resolved — skipping");
    return 0;
  }

  const { data: pieces } = await admin
    .from("pieces_tasks")
    .select("id, name, status, odoo_id, project_id, completed_at, updated_at")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .not("odoo_id", "is", null)
    .gte("updated_at", since);

  if (!pieces || pieces.length === 0) return 0;

  let updated = 0;
  for (const piece of pieces as Array<Record<string, unknown>>) {
    const odooTaskId = piece.odoo_id as number;

    const { data: sessions } = await admin
      .from("work_sessions")
      .select("duration_seconds")
      .eq("piece_task_id", piece.id as string)
      .is("voided_at", null)
      .not("duration_seconds", "is", null);

    const totalSeconds = (sessions ?? []).reduce(
      (sum, s) => sum + ((s.duration_seconds as number) || 0),
      0,
    );
    const effectiveHours = totalSeconds > 0
      ? Number((totalSeconds / 3600).toFixed(2))
      : 0;

    try {
      await odooExecute(ctx, "project.task", "write", [
        [odooTaskId],
        {
          stage_id: doneStageId,
          effective_hours: effectiveHours,
          remaining_hours: 0,
        },
      ]);
      updated++;
    } catch (e) {
      console.warn("pushTaskStatus failed for task", odooTaskId, e);
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// 5) FINAL: Smart Timesheets based on activity_log
// ---------------------------------------------------------------------------
async function pushTimesheets(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
  since: string,
): Promise<number> {
  // 1. جلب أحداث الانتهاء من activity_log
  const { data: terminateEvents } = await admin
    .from("activity_log")
    .select("id, worker_id, event_time, metadata, event_type")
    .eq("company_id", companyId)
    .in("event_type", ["piece_completed", "package_completed"])
    .gte("event_time", since)
    .order("event_time", { ascending: true });

  if (!terminateEvents || terminateEvents.length === 0) return 0;

  let pushed = 0;
  const processedPieces = new Set<string>();

  for (const termEvent of terminateEvents) {
    const pieceId = (termEvent.metadata as Record<string, unknown>)?.piece_task_id as string | undefined;
    if (!pieceId || processedPieces.has(pieceId)) continue;

    // 2. البحث عن حدث البدء (piece_started) لهذه القطعة
    const { data: startEvent } = await admin
      .from("activity_log")
      .select("event_time")
      .eq("company_id", companyId)
      .eq("event_type", "piece_started")
      .contains("metadata", { piece_task_id: pieceId })
      .lt("event_time", termEvent.event_time)
      .order("event_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!startEvent) {
      console.warn(`No start event found for piece ${pieceId}`);
      continue;
    }

    // 3. حساب الفارق الزمني
    const startTime = new Date(startEvent.event_time);
    const endTime = new Date(termEvent.event_time);
    const durationSeconds = Math.max(0, endTime.getTime() - startTime.getTime()) / 1000;
    const hours = Number((durationSeconds / 3600).toFixed(2));
    if (hours <= 0) continue;

    // 4. جلب المراجع (المشروع، العامل، القطعة)
    const { data: piece } = await admin.from("pieces_tasks").select("odoo_id, name, project_id").eq("id", pieceId).maybeSingle();
    const { data: worker } = await admin.from("workers").select("odoo_id, full_name").eq("id", termEvent.worker_id).maybeSingle();

    if (!piece?.odoo_id || !worker?.odoo_id) continue;

    const { data: project } = await admin.from("projects").select("odoo_id").eq("id", piece.project_id).maybeSingle();
    if (!project?.odoo_id) continue;

    const dateStr = startTime.toISOString().split('T')[0];
    const description = `${piece.name} - ${worker.full_name} (Terminé)`;

    // 5. الإرسال إلى Odoo
    try {
      await odooExecute<number>(
        ctx, "account.analytic.line", "create",
        [{ name: description, project_id: project.odoo_id, task_id: piece.odoo_id, employee_id: worker.odoo_id, unit_amount: hours, date: dateStr }],
      );
      processedPieces.add(pieceId);
      pushed++;
    } catch (e) {
      console.warn("pushTimesheets failed", e);
    }
  }
  return pushed;
}

// ---------------------------------------------------------------------------
// 6) Production reports (HTML)
// ---------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function pushProductionReports(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
  since: string,
): Promise<number> {
  const { data: linkedProjects } = await admin
    .from("projects")
    .select("id, odoo_id, code, name")
    .eq("company_id", companyId)
    .not("odoo_id", "is", null)
    .eq("is_archived", false);

  const projects = (linkedProjects ?? []) as Array<{
    id: string;
    odoo_id: number;
    code: string;
    name: string;
  }>;
  if (projects.length === 0) return 0;

  let reportsSent = 0;

  for (const project of projects) {
    const { data: pieces } = await admin
      .from("pieces_tasks")
      .select(
        "name, estimated_time_minutes, cnc_estimated_hours, cnc_estimated_cost, production_status, status, updated_at",
      )
      .eq("project_id", project.id)
      .gte("updated_at", since);

    const changedPieces = (pieces ?? []) as Array<Record<string, unknown>>;
    if (changedPieces.length === 0) continue;

    const completedCount = changedPieces.filter(
      (p) => p.status === "completed",
    ).length;
    const totalHours = changedPieces.reduce(
      (sum, p) => sum + (Number(p.cnc_estimated_hours) || 0),
      0,
    );
    const totalCost = changedPieces.reduce(
      (sum, p) => sum + (Number(p.cnc_estimated_cost) || 0),
      0,
    );

    const rows = changedPieces
      .slice(0, 30)
      .map((p) => {
        const name = escapeHtml(String(p.name ?? "—"));
        const status = escapeHtml(String(p.status ?? "—"));
        const prodStatus = escapeHtml(String(p.production_status ?? "—"));
        return `<tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${name}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${status}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${prodStatus}</td>
        </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:13px;">
        <h3 style="margin:0 0 8px;color:#714B67;">
          [AniXOS] Rapport de production — ${escapeHtml(project.code)}
        </h3>
        <p style="margin:0 0 8px;">
          <strong>Projet :</strong> ${escapeHtml(project.name)}<br/>
          <strong>Pièces mises à jour :</strong> ${changedPieces.length}
          (dont <strong>${completedCount}</strong> terminée(s))<br/>
          <strong>Heures estimées cumulées :</strong> ${totalHours.toFixed(1)} h<br/>
          <strong>Coût estimé cumulé :</strong> ${totalCost.toFixed(2)}
        </p>
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Pièce</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Statut</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Production</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    try {
      await odooExecute<number>(ctx, "mail.message", "create", [
        {
          model: "project.project",
          res_id: project.odoo_id,
          body: html,
          message_type: "comment",
          subtype_xmlid: "mail.mt_comment",
        },
      ]);
      reportsSent++;
    } catch (e) {
      console.warn("pushProductionReports failed for project", project.id, e);
    }
  }

  return reportsSent;
}

// ===========================================================================
// Main handler
// ===========================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let logId: string | null = null;

  try {
    // Auth
    const cronSecretHeader = req.headers.get("x-cron-secret");
    let companyId: string;

    if (CRON_INTERNAL_SECRET && cronSecretHeader === CRON_INTERNAL_SECRET) {
      const body = await req.json().catch(() => ({}));
      const bodyCompanyId = (body as { company_id?: string }).company_id;
      if (!bodyCompanyId) return jsonResponse({ error: "missing_company_id" }, 400);
      companyId = bodyCompanyId;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);

      const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await callerClient.auth.getUser();
      if (!user) return jsonResponse({ error: "unauthorized" }, 401);

      const { data: staff } = await admin
        .from("staff_users")
        .select("company_id")
        .eq("auth_user_id", user.id)
        .eq("is_owner", true)
        .limit(1)
        .maybeSingle();
      if (!staff) return jsonResponse({ error: "forbidden" }, 403);
      companyId = (staff as { company_id: string }).company_id;
    }

    // Load config
    const { data: config } = await admin
      .from("odoo_config")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();
    if (!config) {
      return jsonResponse(
        { error: "not_active", message: "L'intégration Odoo n'est pas active" },
        400,
      );
    }
    const cfg = config as Record<string, unknown>;

    // Open sync log
    const { data: logEntry } = await admin
      .from("odoo_sync_log")
      .insert({ company_id: companyId, direction: "push", status: "in_progress" })
      .select()
      .single();
    logId = (logEntry as { id: string } | null)?.id ?? null;

    // Authenticate
    const apiKey = await decryptApiKey(cfg.api_key_encrypted as string);
    const uid = await authenticateOdoo(
      cfg.odoo_url as string,
      cfg.odoo_db as string,
      cfg.odoo_username as string,
      apiKey,
    );
    const ctx: OdooContext = {
      url: cfg.odoo_url as string,
      db: cfg.odoo_db as string,
      uid,
      apiKey,
    };

    // Version detection (best-effort)
    const detectedVersion = await detectOdooVersion(cfg.odoo_url as string);

    // `since` — separate from Pull
    const since =
      (cfg.last_push_at as string | null) ??
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const syncModules = (cfg.sync_modules as Record<string, boolean>) ?? {};
    const results: Record<string, number> = {};

    // Resolve "done" stage id (fetches + caches if missing)
    const doneStageId = await resolveDoneStageId(
      ctx,
      admin,
      companyId,
      (cfg.stage_mappings as StageMapping) ?? {},
    );

    // -----------------------------------------------------------------------
    // 1) Mirror creation
    // -----------------------------------------------------------------------
    if (syncModules.clients) {
      results.clientsCreatedInOdoo = await pushMissingClients(
        ctx,
        admin,
        companyId,
      );
    }
    if (syncModules.projects) {
      results.projectsCreatedInOdoo = await pushMissingProjects(
        ctx,
        admin,
        companyId,
      );
    }
    if (syncModules.work_orders) {
      results.piecesCreatedInOdoo = await pushMissingPieces(
        ctx,
        admin,
        companyId,
      );
    }

    // -----------------------------------------------------------------------
    // 2) Structured reports — task status + timesheets
    // -----------------------------------------------------------------------
    if (syncModules.work_orders) {
      results.tasksStatusUpdated = await pushTaskStatus(
        ctx,
        admin,
        companyId,
        doneStageId,
        since,
      );
    }

    results.timesheetsCreated = await pushTimesheets(
      ctx,
      admin,
      companyId,
      since,
    );

    // -----------------------------------------------------------------------
    // 3) Project reports (HTML)
    // -----------------------------------------------------------------------
    results.reportsSent = await pushProductionReports(
      ctx,
      admin,
      companyId,
      since,
    );

    const totalSynced = Object.values(results).reduce((a, b) => a + b, 0);
    const now = new Date().toISOString();

    if (logId) {
      await admin
        .from("odoo_sync_log")
        .update({
          status: "success",
          records_synced: totalSynced,
          details: results,
          completed_at: now,
        })
        .eq("id", logId);
    }

    await admin
      .from("odoo_config")
      .update({
        last_sync_at: now,
        last_push_at: now,
        last_sync_status: "success",
        last_sync_error: null,
        records_synced:
          ((cfg.records_synced as number) ?? 0) + totalSynced,
        version: (cfg.version as string | null) ?? detectedVersion,
      })
      .eq("company_id", companyId);

    return jsonResponse({ success: true, results, totalSynced });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Erreur inconnue";
    console.error("sync-odoo-push failed:", err);

    if (logId) {
      await admin
        .from("odoo_sync_log")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    return jsonResponse({ error: "sync_failed", message: errorMessage }, 500);
  }
});