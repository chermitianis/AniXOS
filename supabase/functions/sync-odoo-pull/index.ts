// ============================================================================
// supabase/functions/sync-odoo-pull/index.ts
//
// Unified Pull — supports Standalone and Integrated modes.
//
// Fixes applied in this version:
//   1. ID Reuse Protection: Compares Odoo create_date with local created_at to
//      prevent old pieces from attaching to new projects that reused an ID.
//   2. Re-enabled pullPieces: Since Odoo no longer auto-creates tasks (Project
//      only), we can safely pull manual tasks from Odoo.
//   3. Origin tracking: last_synced_from = 'odoo', odoo_write_date
//   4. Loop prevention: skip if last_synced_from='anixos' and synced <10s ago
//   5. Soft delete: active=false → deleted_at set
//   6. Duplicate detection: same name → record in odoo_sync_conflicts
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

const LOOP_WINDOW_MS = 10_000; // 10 seconds

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
async function getEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
}

async function decryptApiKey(encoded: string): Promise<string> {
  const key = await getEncryptionKey();
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
// Version & auth
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Pagination + field introspection
// ---------------------------------------------------------------------------
async function fetchAllPages<T = Record<string, unknown>>(
  ctx: OdooContext,
  model: string,
  domain: unknown[],
  fields: string[],
  pageSize = 500,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await odooExecute<T[]>(ctx, model, "search_read", [domain], {
      fields,
      limit: pageSize,
      offset,
    });
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

const fieldsCache = new Map<string, Set<string>>();

async function getModelFields(
  ctx: OdooContext,
  model: string,
): Promise<Set<string>> {
  if (fieldsCache.has(model)) return fieldsCache.get(model)!;
  try {
    const def = await odooExecute<Record<string, unknown>>(
      ctx,
      model,
      "fields_get",
      [],
      { attributes: ["type"] },
    );
    const fields = new Set(Object.keys(def ?? {}));
    fieldsCache.set(model, fields);
    return fields;
  } catch {
    const empty = new Set<string>();
    fieldsCache.set(model, empty);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Sync metadata helpers
// ---------------------------------------------------------------------------
function shouldSkipDueToLoop(
  lastSyncedFrom: string | null,
  lastSyncedAt: string | null,
): boolean {
  if (lastSyncedFrom !== "anixos") return false;
  if (!lastSyncedAt) return false;
  const diff = Date.now() - new Date(lastSyncedAt).getTime();
  return diff < LOOP_WINDOW_MS;
}

function odooSyncMetadata(odooWriteDate: string | null): {
  last_synced_from: "odoo";
  last_synced_at: string;
  odoo_write_date: string | null;
} {
  return {
    last_synced_from: "odoo",
    last_synced_at: new Date().toISOString(),
    odoo_write_date: odooWriteDate,
  };
}

async function recordDuplicateConflict(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  conceptKey: string,
  odooId: number,
  odooName: string,
  anixosId: string,
  anixosName: string,
  reason = "duplicate_name",
): Promise<void> {
  try {
    const { data: existing } = await admin
      .from("odoo_sync_conflicts")
      .select("id")
      .eq("company_id", companyId)
      .eq("concept_key", conceptKey)
      .eq("odoo_record_id", odooId)
      .eq("anixos_record_id", anixosId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) return;

    await admin.from("odoo_sync_conflicts").insert({
      company_id: companyId,
      concept_key: conceptKey,
      odoo_record_id: odooId,
      odoo_record_name: odooName,
      anixos_record_id: anixosId,
      anixos_record_name: anixosName,
      conflict_reason: reason,
      status: "pending",
    });
  } catch (err) {
    console.warn("recordDuplicateConflict failed (non-blocking)", err);
  }
}

// ===========================================================================
// PULL HANDLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
async function pullClients(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const partners = await fetchAllPages(
    ctx,
    "res.partner",
    [["customer_rank", ">", 0]],
    ["id", "name", "email", "phone", "street", "city", "write_date", "active"],
  );

  let count = 0;
  for (const p of partners) {
    const odooId = p.id as number;
    const isActive = p.active !== false;
    const meta = odooSyncMetadata(p.write_date as string | null);

    const { data: existing } = await admin
      .from("clients")
      .select("id, last_synced_from, last_synced_at")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    if (existing) {
      const ex = existing as {
        id: string;
        last_synced_from: string | null;
        last_synced_at: string | null;
      };

      if (shouldSkipDueToLoop(ex.last_synced_from, ex.last_synced_at)) continue;

      const { error } = await admin
        .from("clients")
        .update({
          name: String(p.name ?? ""),
          email: p.email ? String(p.email) : null,
          phone: p.phone ? String(p.phone) : null,
          address: p.street ? String(p.street) : null,
          is_active: isActive,
          deleted_at: isActive ? null : new Date().toISOString(),
          ...meta,
        })
        .eq("id", ex.id);

      if (!error) count++;
    } else {
      const { data: sameName } = await admin
        .from("clients")
        .select("id, name")
        .eq("company_id", companyId)
        .is("odoo_id", null)
        .ilike("name", String(p.name ?? ""))
        .maybeSingle();

      const { data: inserted, error } = await admin
        .from("clients")
        .insert({
          company_id: companyId,
          name: String(p.name ?? ""),
          email: p.email ? String(p.email) : null,
          phone: p.phone ? String(p.phone) : null,
          address: p.street ? String(p.street) : null,
          odoo_id: odooId,
          is_active: isActive,
          ...meta,
        })
        .select("id")
        .single();

      if (!error && inserted) {
        count++;
        if (sameName) {
          await recordDuplicateConflict(
            admin, companyId, "client", odooId, String(p.name ?? ""),
            (sameName as { id: string }).id, (sameName as { name: string }).name,
          );
        }
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Projects (With ID Reuse Protection)
// ---------------------------------------------------------------------------
async function pullProjects(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<{ count: number; projectIdByOdooId: Map<number, string> }> {
  const projects = await fetchAllPages(ctx, "project.project", [], [
    "id", "name", "partner_id", "date_start", "date", "write_date", "active", "create_date"
  ]);

  let count = 0;
  const projectIdByOdooId = new Map<number, string>();

  for (const p of projects) {
    const odooId = p.id as number;
    const isActive = p.active !== false;
    const meta = odooSyncMetadata(p.write_date as string | null);
    const odooCreateDate = p.create_date ? new Date(p.create_date as string).getTime() : 0;

    let clientId: string | null = null;
    const partnerField = p.partner_id as [number, string] | false;
    if (partnerField && Array.isArray(partnerField)) {
      const { data: localClient } = await admin
        .from("clients")
        .select("id")
        .eq("company_id", companyId)
        .eq("odoo_id", partnerField[0])
        .maybeSingle();
      clientId = (localClient as { id: string } | null)?.id ?? null;
    }

    const { data: existing } = await admin
      .from("projects")
      .select("id, code, last_synced_from, last_synced_at, created_at")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    if (existing) {
      const ex = existing as {
        id: string;
        code: string;
        last_synced_from: string | null;
        last_synced_at: string | null;
        created_at: string;
      };
      
      if (shouldSkipDueToLoop(ex.last_synced_from, ex.last_synced_at)) {
        projectIdByOdooId.set(odooId, ex.id);
        continue;
      }

      // 🛡️ ID Reuse Protection
      const localCreatedAt = new Date(ex.created_at).getTime();
      if (odooCreateDate > localCreatedAt + 86400000) { // > 24 hours difference
        console.warn(`ID Reuse detected for project ${odooId}. Archiving old record.`);
        await admin.from("projects").update({ is_archived: true, deleted_at: new Date().toISOString() }).eq("id", ex.id);
        // Continue to insert block below to create a new project
      } else {
        // Normal update
        const { error } = await admin
          .from("projects")
          .update({
            client_id: clientId,
            name: String(p.name ?? ""),
            start_date: p.date_start || null,
            due_date: p.date || null,
            is_archived: !isActive,
            deleted_at: isActive ? null : new Date().toISOString(),
            ...meta,
          })
          .eq("id", ex.id);
        if (!error) {
          count++;
          projectIdByOdooId.set(odooId, ex.id);
        }
        continue;
      }
    }

    // Insert New Project
    const { data: generated, error: codeError } = await admin.rpc(
      "generate_project_code",
      { p_company_id: companyId, p_client_id: clientId },
    );
    if (codeError) {
      console.warn("generate_project_code failed", odooId, codeError.message);
      continue;
    }

    const { data: sameName } = await admin
      .from("projects")
      .select("id, name")
      .eq("company_id", companyId)
      .is("odoo_id", null)
      .ilike("name", String(p.name ?? ""))
      .maybeSingle();

    const { data: inserted, error } = await admin
      .from("projects")
      .insert({
        company_id: companyId,
        client_id: clientId,
        name: String(p.name ?? ""),
        code: generated as string,
        status: "draft",
        odoo_id: odooId,
        start_date: p.date_start || null,
        due_date: p.date || null,
        is_archived: !isActive,
        ...meta,
      })
      .select("id")
      .single();

    if (!error && inserted) {
      count++;
      projectIdByOdooId.set(odooId, (inserted as { id: string }).id);
      if (sameName) {
        await recordDuplicateConflict(
          admin, companyId, "project", odooId, String(p.name ?? ""),
          (sameName as { id: string }).id, (sameName as { name: string }).name,
        );
      }
    }
  }

  return { count, projectIdByOdooId };
}

// ---------------------------------------------------------------------------
// Pieces (Tasks)
// ---------------------------------------------------------------------------
async function pullPieces(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
  projectIdByOdooId: Map<number, string>,
): Promise<number> {
  if (projectIdByOdooId.size === 0) return 0;

  const odooProjectIds = Array.from(projectIdByOdooId.keys());

  const tasks = await fetchAllPages(
    ctx,
    "project.task",
    [["project_id", "in", odooProjectIds]],
    ["id", "name", "project_id", "write_date", "active"],
  );

  if (tasks.length === 0) return 0;

  const taskFields = await getModelFields(ctx, "project.task");
  const hoursField = ["allocated_hours", "planned_hours", "planned_hours_cost"].find(f => taskFields.has(f));
  const hoursByTaskId = new Map<number, number>();
  
  if (hoursField) {
    try {
      const withHours = await odooExecute<Array<Record<string, unknown>>>(
        ctx, "project.task", "search_read", [[["project_id", "in", odooProjectIds]]],
        { fields: ["id", hoursField], limit: 2000 },
      );
      for (const row of withHours) {
        const val = row[hoursField];
        if (typeof val === "number" && val > 0) hoursByTaskId.set(row.id as number, val);
      }
    } catch (err) {
      console.warn(`pullPieces: hours fetch failed`, err);
    }
  }

  let count = 0;
  for (const t of tasks) {
    const odooId = t.id as number;
    const projectField = t.project_id as [number, string] | false;
    if (!projectField || !Array.isArray(projectField)) continue;
    const localProjectId = projectIdByOdooId.get(projectField[0]);
    if (!localProjectId) continue;

    const isActive = t.active !== false;
    const meta = odooSyncMetadata(t.write_date as string | null);
    const plannedHours = hoursByTaskId.get(odooId) ?? 0;

    const { data: existing } = await admin
      .from("pieces_tasks")
      .select("id, last_synced_from, last_synced_at")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    if (existing) {
      const ex = existing as { id: string; last_synced_from: string | null; last_synced_at: string | null };
      if (shouldSkipDueToLoop(ex.last_synced_from, ex.last_synced_at)) continue;

      const { error } = await admin
        .from("pieces_tasks")
        .update({
          project_id: localProjectId,
          name: String(t.name ?? ""),
          estimated_time_minutes: plannedHours > 0 ? Math.round(plannedHours * 60) : null,
          deleted_at: isActive ? null : new Date().toISOString(),
          ...meta,
        })
        .eq("id", ex.id);
      if (!error) count++;
    } else {
      const { error } = await admin.from("pieces_tasks").insert({
        company_id: companyId,
        project_id: localProjectId,
        name: String(t.name ?? ""),
        estimated_time_minutes: plannedHours > 0 ? Math.round(plannedHours * 60) : null,
        quantity: 1,
        odoo_id: odooId,
        ...meta,
      });
      if (!error) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------
async function pullWorkers(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const fields = await getModelFields(ctx, "hr.employee");
  const candidates = ["id", "name", "work_email", "work_phone", "hourly_cost", "active", "write_date"];
  const availableFields = candidates.filter((f) => fields.has(f));

  if (!availableFields.includes("id") || !availableFields.includes("name")) return 0;

  const employees = await fetchAllPages(ctx, "hr.employee", [], availableFields);
  let count = 0;

  for (const e of employees) {
    const odooId = e.id as number;
    const fullName = String(e.name ?? `Employee ${odooId}`).trim();
    const isActive = e.active !== false;
    const meta = odooSyncMetadata(e.write_date as string | null);

    const { data: existing } = await admin
      .from("workers")
      .select("id, last_synced_from, last_synced_at")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    if (existing) {
      const ex = existing as { id: string; last_synced_from: string | null; last_synced_at: string | null };
      if (shouldSkipDueToLoop(ex.last_synced_from, ex.last_synced_at)) continue;

      const { error } = await admin
        .from("workers")
        .update({
          full_name: fullName,
          hourly_cost: typeof e.hourly_cost === "number" ? e.hourly_cost : 0,
          is_active: isActive,
          deleted_at: isActive ? null : new Date().toISOString(),
          ...meta,
        })
        .eq("id", ex.id);
      if (!error) count++;
    } else {
      const { error } = await admin.from("workers").insert({
        company_id: companyId,
        odoo_id: odooId,
        full_name: fullName,
        username: `odoo_${odooId}`,
        password_hash: null,
        hourly_cost: typeof e.hourly_cost === "number" ? e.hourly_cost : 0,
        is_active: isActive,
        interface_type: "both",
        ...meta,
      });
      if (!error) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------
async function pullMachines(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const fields = await getModelFields(ctx, "maintenance.equipment");
  const candidates = ["id", "name", "code", "location", "active", "write_date"];
  const availableFields = candidates.filter((f) => fields.has(f));

  if (!availableFields.includes("id") || !availableFields.includes("name")) return 0;

  const equipments = await fetchAllPages(ctx, "maintenance.equipment", [], availableFields);
  let count = 0;

  for (const eq of equipments) {
    const odooId = eq.id as number;
    const name = String(eq.name ?? `Machine ${odooId}`).trim();
    const code = eq.code ? String(eq.code).trim() : `M-${odooId}`;
    const isActive = eq.active !== false;
    const meta = odooSyncMetadata(eq.write_date as string | null);

    const { data: existing } = await admin
      .from("machines")
      .select("id, last_synced_from, last_synced_at")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    if (existing) {
      const ex = existing as { id: string; last_synced_from: string | null; last_synced_at: string | null };
      if (shouldSkipDueToLoop(ex.last_synced_from, ex.last_synced_at)) continue;

      const { error } = await admin
        .from("machines")
        .update({
          name, code,
          location: eq.location ? String(eq.location) : null,
          is_active: isActive,
          deleted_at: isActive ? null : new Date().toISOString(),
          ...meta,
        })
        .eq("id", ex.id);
      if (!error) count++;
    } else {
      const { error } = await admin.from("machines").insert({
        company_id: companyId,
        odoo_id: odooId,
        name, code,
        location: eq.location ? String(eq.location) : null,
        current_status: "idle",
        is_active: isActive,
        tool_count: 0,
        interface_type: "cnc_classique",
        ...meta,
      });
      if (!error) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Stage mappings cache
// ---------------------------------------------------------------------------
async function cacheStageMappings(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<void> {
  try {
    const stages = await odooExecute<
      Array<{ id: number; name: string; sequence: number }>
    >(ctx, "project.task.type", "search_read", [[]], {
      fields: ["id", "name", "sequence"],
    });

    const mappings: Record<string, { name: string; sequence: number }> = {};
    for (const s of stages) {
      mappings[String(s.id)] = { name: s.name, sequence: s.sequence };
    }

    await admin
      .from("odoo_config")
      .update({ stage_mappings: mappings })
      .eq("company_id", companyId);
  } catch (err) {
    console.warn("cacheStageMappings failed (non-blocking)", err);
  }
}

// ===========================================================================
// Main handler
// ===========================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let logId: string | null = null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
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
        data: { user: callerUser },
      } = await callerClient.auth.getUser();
      if (!callerUser) return jsonResponse({ error: "unauthorized" }, 401);

      const { data: staff } = await admin
        .from("staff_users")
        .select("company_id")
        .eq("auth_user_id", callerUser.id)
        .eq("is_owner", true)
        .limit(1)
        .maybeSingle();
      if (!staff) return jsonResponse({ error: "forbidden" }, 403);
      companyId = (staff as { company_id: string }).company_id;
    }

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

    const { data: logEntry } = await admin
      .from("odoo_sync_log")
      .insert({ company_id: companyId, direction: "pull", status: "in_progress" })
      .select()
      .single();
    logId = (logEntry as { id: string } | null)?.id ?? null;

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

    const detectedVersion = await detectOdooVersion(cfg.odoo_url as string);

    const syncModules = (cfg.sync_modules as Record<string, boolean>) ?? {};
    const results: Record<string, number> = {};
    let projectIdByOdooId = new Map<number, string>();

    if (syncModules.clients) results.clients = await pullClients(ctx, admin, companyId);
    if (syncModules.workers) results.workers = await pullWorkers(ctx, admin, companyId);
    if (syncModules.machines) results.machines = await pullMachines(ctx, admin, companyId);
    
    if (syncModules.projects) {
      const r = await pullProjects(ctx, admin, companyId);
      results.projects = r.count;
      projectIdByOdooId = r.projectIdByOdooId;
    }
    if (syncModules.work_orders && projectIdByOdooId.size > 0) {
      results.pieces = await pullPieces(ctx, admin, companyId, projectIdByOdooId);
    }

    await cacheStageMappings(ctx, admin, companyId);

    const totalSynced = Object.values(results).reduce((a, b) => a + b, 0);
    const now = new Date().toISOString();

    if (logId) {
      await admin
        .from("odoo_sync_log")
        .update({ status: "success", records_synced: totalSynced, details: results, completed_at: now })
        .eq("id", logId);
    }

    await admin
      .from("odoo_config")
      .update({
        last_sync_at: now,
        last_sync_status: "success",
        last_sync_error: null,
        records_synced: ((cfg.records_synced as number) ?? 0) + totalSynced,
        version: (cfg.version as string | null) ?? detectedVersion,
      })
      .eq("company_id", companyId);

    return jsonResponse({ success: true, results, totalSynced });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("sync-odoo-pull failed:", err);

    if (logId) {
      await admin
        .from("odoo_sync_log")
        .update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() })
        .eq("id", logId);
    }
    return jsonResponse({ error: "sync_failed", message: errorMessage }, 500);
  }
});
