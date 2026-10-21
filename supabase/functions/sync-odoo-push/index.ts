import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("ODOO_ENCRYPTION_KEY") ?? "anixos-odoo-default-key-change-me";
const CRON_INTERNAL_SECRET = Deno.env.get("CRON_INTERNAL_SECRET");

const LOOP_WINDOW_MS = 10_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body });
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
      const isNetwork = err instanceof TypeError || (err instanceof Error && err.message.includes("fetch"));
      if (!isNetwork || attempt === MAX_RETRIES - 1) throw err;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Odoo request failed");
}

async function authenticateOdoo(url: string, db: string, username: string, apiKey: string): Promise<number> {
  const response = await fetch(`${url.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "common", method: "authenticate", args: [db, username, apiKey, {}] }, id: 1 }),
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

function shouldSkipDueToLoop(lastSyncedFrom: string | null, lastSyncedAt: string | null): boolean {
  if (lastSyncedFrom !== "odoo") return false;
  if (!lastSyncedAt) return false;
  return (Date.now() - new Date(lastSyncedAt).getTime()) < LOOP_WINDOW_MS;
}

function anixosSyncMetadata() {
  return { last_synced_from: "anixos", last_synced_at: new Date().toISOString() };
}

interface StageMapping { [stageId: string]: { name: string; sequence?: number }; }

const DONE_STAGE_NAMES = ["Terminé", "Terminée", "Termine", "Done", "Completed", "Finished", "Fait", "Clôturé", "منتهية", "مكتملة", "منجز", "OK"];

async function resolveDoneStageId(ctx: OdooContext, admin: ReturnType<typeof createClient>, companyId: string, currentMappings: StageMapping): Promise<number | null> {
  let mappings = currentMappings;
  if (Object.keys(mappings).length === 0) {
    try {
      const stages = await odooExecute<Array<{ id: number; name: string; sequence: number }>>(ctx, "project.task.type", "search_read", [[]], { fields: ["id", "name", "sequence"] });
      mappings = {};
      for (const s of stages) mappings[String(s.id)] = { name: s.name, sequence: s.sequence };
      await admin.from("odoo_config").update({ stage_mappings: mappings }).eq("company_id", companyId);
    } catch (err) { return null; }
  }
  for (const [id, meta] of Object.entries(mappings)) {
    if (DONE_STAGE_NAMES.some(candidate => meta.name.toLowerCase().includes(candidate.toLowerCase()))) return Number(id);
  }
  return null;
}

// --- PUSH HANDLERS ---

async function pushMissingClients(ctx: OdooContext, admin: ReturnType<typeof createClient>, companyId: string): Promise<number> {
  const { data: localClients } = await admin.from("clients").select("id, name, email, phone, address, last_synced_from, last_synced_at").eq("company_id", companyId).is("odoo_id", null).eq("is_active", true);
  let created = 0;
  for (const c of (localClients ?? [])) {
    if (shouldSkipDueToLoop(c.last_synced_from, c.last_synced_at)) continue;
    try {
      const odooId = await odooExecute<number>(ctx, "res.partner", "create", [{ name: String(c.name ?? ""), email: c.email || false, phone: c.phone || false, street: c.address || false, customer_rank: 1 }]);
      await admin.from("clients").update({ odoo_id: odooId, ...anixosSyncMetadata() }).eq("id", c.id);
      created++;
    } catch (e) { console.warn("pushMissingClients failed", c.id, e); }
  }
  return created;
}

async function pushMissingProjects(ctx: OdooContext, admin: ReturnType<typeof createClient>, companyId: string): Promise<number> {
  const { data: localProjects } = await admin.from("projects").select("id, name, client_id, start_date, due_date, last_synced_from, last_synced_at").eq("company_id", companyId).is("odoo_id", null).eq("is_archived", false);
  let created = 0;
  for (const p of (localProjects ?? [])) {
    if (shouldSkipDueToLoop(p.last_synced_from, p.last_synced_at)) continue;
    try {
      let odooPartnerId: number | false = false;
      if (p.client_id) {
        const { data: client } = await admin.from("clients").select("odoo_id").eq("id", p.client_id).maybeSingle();
        if (client?.odoo_id) odooPartnerId = client.odoo_id;
      }
      const odooId = await odooExecute<number>(ctx, "project.project", "create", [{ name: String(p.name ?? ""), partner_id: odooPartnerId, date_start: p.start_date || false, date: p.due_date || false }]);
      await admin.from("projects").update({ odoo_id: odooId, ...anixosSyncMetadata() }).eq("id", p.id);
      created++;
    } catch (e) { console.warn("pushMissingProjects failed", p.id, e); }
  }
  return created;
}

async function pushMissingPieces(ctx: OdooContext, admin: ReturnType<typeof createClient>, companyId: string): Promise<number> {
  const { data: linkedProjects } = await admin.from("projects").select("id, odoo_id").eq("company_id", companyId).not("odoo_id", "is", null).eq("is_archived", false);
  const projects = (linkedProjects ?? []) as any[];
  if (projects.length === 0) return 0;

  const projectByLocalId = new Map(projects.map((p) => [p.id, p.odoo_id]));
  const { data: localPieces } = await admin.from("pieces_tasks").select("id, name, project_id, estimated_time_minutes, last_synced_from, last_synced_at").eq("company_id", companyId).is("odoo_id", null).in("project_id", projects.map((p) => p.id));

  let created = 0;
  for (const piece of (localPieces ?? [])) {
    if (shouldSkipDueToLoop(piece.last_synced_from, piece.last_synced_at)) continue;
    const odooProjectId = projectByLocalId.get(piece.project_id);
    if (!odooProjectId) continue;
    try {
      const payload: any = { name: String(piece.name ?? ""), project_id: odooProjectId };
      const minutes = piece.estimated_time_minutes;
      if (minutes && minutes > 0) payload.planned_hours = minutes / 60;
      const odooId = await odooExecute<number>(ctx, "project.task", "create", [payload]);
      await admin.from("pieces_tasks").update({ odoo_id: odooId, ...anixosSyncMetadata() }).eq("id", piece.id);
      created++;
    } catch (e) { console.warn("pushMissingPieces failed", piece.id, e); }
  }
  return created;
}

async function pushTaskStatus(ctx: OdooContext, admin: ReturnType<typeof createClient>, companyId: string, doneStageId: number | null, since: string): Promise<number> {
  if (!doneStageId) return 0;
  const { data: pieces } = await admin.from("pieces_tasks").select("id, name, status, odoo_id, project_id, completed_at, updated_at, last_synced_from, last_synced_at").eq("company_id", companyId).eq("status", "completed").not("odoo_id", "is", null).gte("updated_at", since);

  let updated = 0;
  for (const piece of (pieces ?? [])) {
    if (shouldSkipDueToLoop(piece.last_synced_from, piece.last_synced_at)) continue;
    const odooTaskId = piece.odoo_id;
    const { data: sessions } = await admin.from("work_sessions").select("duration_seconds").eq("piece_task_id", piece.id).is("voided_at", null).not("duration_seconds", "is", null);
    const totalSeconds = (sessions ?? []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    const effectiveHours = totalSeconds > 0 ? Number((totalSeconds / 3600).toFixed(2)) : 0;
    try {
      await odooExecute(ctx, "project.task", "write", [[odooTaskId], { stage_id: doneStageId, effective_hours: effectiveHours, remaining_hours: 0 }]);
      await admin.from("pieces_tasks").update(anixosSyncMetadata()).eq("id", piece.id);
      updated++;
    } catch (e) { console.warn("pushTaskStatus failed", odooTaskId, e); }
  }
  return updated;
}

async function pushTimesheets(ctx: OdooContext, admin: ReturnType<typeof createClient>, companyId: string, since: string): Promise<number> {
  const { data: sessions } = await admin.from("work_sessions").select("id, worker_id, project_id, piece_task_id, started_at, duration_seconds, note, odoo_timesheet_id").eq("company_id", companyId).is("odoo_timesheet_id", null).is("voided_at", null).not("ended_at", "is", null).gte("started_at", since).limit(500);
  if (!sessions || sessions.length === 0) return 0;

  let pushed = 0;
  for (const s of sessions) {
    if (!s.project_id || !s.piece_task_id) continue;
    const { data: worker } = await admin.from("workers").select("odoo_id").eq("id", s.worker_id).maybeSingle();
    if (!worker?.odoo_id) continue;
    const { data: project } = await admin.from("projects").select("odoo_id").eq("id", s.project_id).maybeSingle();
    if (!project?.odoo_id) continue;
    const { data: piece } = await admin.from("pieces_tasks").select("odoo_id, name").eq("id", s.piece_task_id).maybeSingle();
    if (!piece?.odoo_id) continue;

    const durationSec = s.duration_seconds || 0;
    if (durationSec <= 0) continue;

    const hours = Number((durationSec / 3600).toFixed(2));
    const dateStr = s.started_at.slice(0, 10);
    const description = s.note ? `${piece.name} — ${s.note}` : `${piece.name} (session AniXOS)`;

    try {
      const timesheetId = await odooExecute<number>(ctx, "account.analytic.line", "create", [{ name: description, project_id: project.odoo_id, task_id: piece.odoo_id, employee_id: worker.odoo_id, unit_amount: hours, date: dateStr }]);
      await admin.from("work_sessions").update({ odoo_timesheet_id: timesheetId }).eq("id", s.id);
      pushed++;
    } catch (e) { console.warn("pushTimesheets failed", s.id, e); }
  }
  return pushed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let logId: string | null = null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const cronSecretHeader = req.headers.get("x-cron-secret");
    let companyId: string;
    if (CRON_INTERNAL_SECRET && cronSecretHeader === CRON_INTERNAL_SECRET) {
      const body = await req.json().catch(() => ({}));
      companyId = (body as any).company_id;
      if (!companyId) return jsonResponse({ error: "missing_company_id" }, 400);
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await callerClient.auth.getUser();
      if (!user) return jsonResponse({ error: "unauthorized" }, 401);
      const { data: staff } = await admin.from("staff_users").select("company_id").eq("auth_user_id", user.id).eq("is_owner", true).limit(1).maybeSingle();
      if (!staff) return jsonResponse({ error: "forbidden" }, 403);
      companyId = (staff as any).company_id;
    }

    const { data: config } = await admin.from("odoo_config").select("*").eq("company_id", companyId).eq("is_active", true).maybeSingle();
    if (!config) return jsonResponse({ error: "not_active" }, 400);
    const cfg = config as any;

    const { data: logEntry } = await admin.from("odoo_sync_log").insert({ company_id: companyId, direction: "push", status: "in_progress" }).select().single();
    logId = (logEntry as any)?.id ?? null;

    const apiKey = await decryptApiKey(cfg.api_key_encrypted);
    const uid = await authenticateOdoo(cfg.odoo_url, cfg.odoo_db, cfg.odoo_username, apiKey);
    const ctx: OdooContext = { url: cfg.odoo_url, db: cfg.odoo_db, uid, apiKey };
    const detectedVersion = await detectOdooVersion(cfg.odoo_url);

    const since = cfg.last_push_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const syncModules = cfg.sync_modules ?? {};
    const results: Record<string, number> = {};

    const doneStageId = await resolveDoneStageId(ctx, admin, companyId, cfg.stage_mappings ?? {});

    if (syncModules.clients) results.clientsCreatedInOdoo = await pushMissingClients(ctx, admin, companyId);
    if (syncModules.projects) results.projectsCreatedInOdoo = await pushMissingProjects(ctx, admin, companyId);
    if (syncModules.work_orders) {
      results.piecesCreatedInOdoo = await pushMissingPieces(ctx, admin, companyId);
      results.tasksStatusUpdated = await pushTaskStatus(ctx, admin, companyId, doneStageId, since);
    }
    
    results.timesheetsCreated = await pushTimesheets(ctx, admin, companyId, since);

    const totalSynced = Object.values(results).reduce((a, b) => a + b, 0);
    const now = new Date().toISOString();

    if (logId) await admin.from("odoo_sync_log").update({ status: "success", records_synced: totalSynced, details: results, completed_at: now }).eq("id", logId);
    await admin.from("odoo_config").update({ last_sync_at: now, last_push_at: now, last_sync_status: "success", last_sync_error: null, records_synced: (cfg.records_synced ?? 0) + totalSynced, version: cfg.version ?? detectedVersion }).eq("company_id", companyId);

    return jsonResponse({ success: true, results, totalSynced });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("sync-odoo-push failed:", err);
    if (logId) await admin.from("odoo_sync_log").update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() }).eq("id", logId);
    return jsonResponse({ error: "sync_failed", message: msg }, 500);
  }
});
