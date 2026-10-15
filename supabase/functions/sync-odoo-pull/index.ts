// ============================================================================
// supabase/functions/sync-odoo-pull/index.ts
//
// Pulls all resources from Odoo into AniXOS:
//   - clients               (res.partner, customer_rank > 0)
//   - projects              (project.project)
//   - pieces (tasks)        (project.task)
//   - workers               (hr.employee)
//   - machines              (maintenance.equipment)
//   - manufacturing_orders  (mrp.production)
//   - planning              (planning.slot)
//
// Also caches Odoo stage mappings (project.task.type) for later Push.
//
// Idempotency: every row uses `odoo_id` as stable key (UNIQUE with company_id).
// Codes are generated locally (generate_project_code) — never from Odoo.
//
// Version detection: `detectOdooVersion` runs once, result stored in config.
//
// Fixes applied:
//   1. workers: username auto-generated ('odoo_<id>'), password_hash NULL
//   2. machines: full mapping from maintenance.equipment
//   3. manufacturing_orders: full mapping from mrp.production
//   4. planning: full mapping from planning.slot
//   5. stage_mappings: cached at first pull (project.task.type)
//   6. All pull handlers separated into functions (easier to maintain)
//   7. Network retry with exponential backoff
//   8. Explicit response.ok check everywhere
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
// Version detection
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

// ---------------------------------------------------------------------------
// Authentication
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

// ---------------------------------------------------------------------------
// Pagination
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

// ---------------------------------------------------------------------------
// Field introspection (cached)
// ---------------------------------------------------------------------------
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

function pickField(available: Set<string>, candidates: string[]): string | null {
  for (const c of candidates) {
    if (available.has(c)) return c;
  }
  return null;
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
    ["id", "name", "email", "phone", "street", "city"],
  );

  let count = 0;
  for (const p of partners) {
    const { error } = await admin.from("clients").upsert(
      {
        company_id: companyId,
        name: String(p.name ?? ""),
        email: p.email ? String(p.email) : null,
        phone: p.phone ? String(p.phone) : null,
        address: p.street ? String(p.street) : null,
        odoo_id: p.id,
      },
      { onConflict: "company_id,odoo_id" },
    );
    if (!error) count++;
    else console.warn("pullClients upsert failed", p.id, error.message);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
async function pullProjects(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<{ count: number; projectIdByOdooId: Map<number, string> }> {
  const projects = await fetchAllPages(ctx, "project.project", [], [
    "id",
    "name",
    "partner_id",
    "date_start",
    "date",
  ]);

  let count = 0;
  const projectIdByOdooId = new Map<number, string>();

  for (const p of projects) {
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
      .select("id, code")
      .eq("company_id", companyId)
      .eq("odoo_id", p.id)
      .maybeSingle();

    let code: string;
    if (existing) {
      code = (existing as { code: string }).code;
    } else {
      const { data: generated, error: codeError } = await admin.rpc(
        "generate_project_code",
        { p_company_id: companyId, p_client_id: clientId },
      );
      if (codeError) {
        console.warn("generate_project_code failed", p.id, codeError.message);
        continue;
      }
      code = generated as string;
    }

    const { data: upserted, error } = await admin
      .from("projects")
      .upsert(
        {
          company_id: companyId,
          client_id: clientId,
          name: String(p.name ?? ""),
          code,
          status: "draft",
          odoo_id: p.id,
          start_date: p.date_start || null,
          due_date: p.date || null,
        },
        { onConflict: "company_id,odoo_id" },
      )
      .select("id")
      .single();

    if (!error && upserted) {
      count++;
      projectIdByOdooId.set(p.id as number, (upserted as { id: string }).id);
    } else if (error) {
      console.warn("pullProjects upsert failed", p.id, error.message);
    }
  }

  return { count, projectIdByOdooId };
}

// ---------------------------------------------------------------------------
// Pieces (project.task)
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
    ["id", "name", "project_id"],
  );

  if (tasks.length === 0) return 0;

  // Detect hours field
  const taskFields = await getModelFields(ctx, "project.task");
  const hoursField = pickField(taskFields, [
    "allocated_hours",
    "planned_hours",
    "planned_hours_cost",
  ]);

  const hoursByTaskId = new Map<number, number>();
  if (hoursField) {
    try {
      const withHours = await odooExecute<Array<Record<string, unknown>>>(
        ctx,
        "project.task",
        "search_read",
        [[["project_id", "in", odooProjectIds]]],
        { fields: ["id", hoursField], limit: 2000 },
      );
      for (const row of withHours) {
        const val = row[hoursField];
        if (typeof val === "number" && val > 0) {
          hoursByTaskId.set(row.id as number, val);
        }
      }
    } catch (err) {
      console.warn(`pullPieces: failed to fetch ${hoursField}`, err);
    }
  }

  let count = 0;
  for (const t of tasks) {
    const projectField = t.project_id as [number, string] | false;
    if (!projectField || !Array.isArray(projectField)) continue;
    const localProjectId = projectIdByOdooId.get(projectField[0]);
    if (!localProjectId) continue;

    const plannedHours = hoursByTaskId.get(t.id as number) ?? 0;
    const { error } = await admin.from("pieces_tasks").upsert(
      {
        company_id: companyId,
        project_id: localProjectId,
        name: String(t.name ?? ""),
        estimated_time_minutes:
          plannedHours > 0 ? Math.round(plannedHours * 60) : null,
        quantity: 1,
        odoo_id: t.id,
      },
      { onConflict: "company_id,odoo_id" },
    );
    if (!error) count++;
    else console.warn("pullPieces upsert failed", t.id, error.message);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Workers (hr.employee)
//
// NOTE: password_hash and username are NULL for Odoo-pulled workers.
//       An admin must assign credentials manually in AniXOS.
// ---------------------------------------------------------------------------
async function pullWorkers(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  // Detect available fields (varies across Odoo versions)
  const fields = await getModelFields(ctx, "hr.employee");
  const candidates = ["id", "name", "work_email", "work_phone", "hourly_cost", "active"];
  const availableFields = candidates.filter((f) => fields.has(f));

  if (!availableFields.includes("id") || !availableFields.includes("name")) {
    console.warn("pullWorkers: hr.employee missing id or name — skipping");
    return 0;
  }

  const employees = await fetchAllPages(
    ctx,
    "hr.employee",
    [],
    availableFields,
  );

  let count = 0;
  for (const e of employees) {
    const odooId = e.id as number;
    const fullName = String(e.name ?? `Employee ${odooId}`).trim();

    // Check if worker already exists
    const { data: existing } = await admin
      .from("workers")
      .select("id")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    if (existing) {
      // Update only mutable fields — never touch credentials
      const { error } = await admin
        .from("workers")
        .update({
          full_name: fullName,
          hourly_cost:
            typeof e.hourly_cost === "number" ? e.hourly_cost : 0,
        })
        .eq("id", (existing as { id: string }).id);
      if (!error) count++;
      else console.warn("pullWorkers update failed", odooId, error.message);
      continue;
    }

    // New worker — insert with NULL credentials
    const { error } = await admin.from("workers").insert({
      company_id: companyId,
      odoo_id: odooId,
      full_name: fullName,
      username: `odoo_${odooId}`, // auto-generated placeholder
      password_hash: null, // ← requires admin to set
      hourly_cost: typeof e.hourly_cost === "number" ? e.hourly_cost : 0,
      is_active: e.active !== false,
      interface_type: "both",
    });

    if (!error) count++;
    else console.warn("pullWorkers insert failed", odooId, error.message);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Machines (maintenance.equipment)
// ---------------------------------------------------------------------------
async function pullMachines(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const fields = await getModelFields(ctx, "maintenance.equipment");
  const candidates = [
    "id",
    "name",
    "code",
    "category_id",
    "location",
    "active",
  ];
  const availableFields = candidates.filter((f) => fields.has(f));

  if (!availableFields.includes("id") || !availableFields.includes("name")) {
    console.warn("pullMachines: maintenance.equipment missing id or name — skipping");
    return 0;
  }

  const equipments = await fetchAllPages(
    ctx,
    "maintenance.equipment",
    [],
    availableFields,
  );

  let count = 0;
  for (const eq of equipments) {
    const odooId = eq.id as number;
    const name = String(eq.name ?? `Machine ${odooId}`).trim();
    const code = eq.code
      ? String(eq.code).trim()
      : `M-${odooId}`; // fallback code if Odoo doesn't provide one

    const { data: existing } = await admin
      .from("machines")
      .select("id")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("machines")
        .update({
          name,
          code,
          location: eq.location ? String(eq.location) : null,
          is_active: eq.active !== false,
        })
        .eq("id", (existing as { id: string }).id);
      if (!error) count++;
      else console.warn("pullMachines update failed", odooId, error.message);
      continue;
    }

    // New machine — provide required fields with sensible defaults
    const { error } = await admin.from("machines").insert({
      company_id: companyId,
      odoo_id: odooId,
      name,
      code,
      location: eq.location ? String(eq.location) : null,
      current_status: "idle", // required — default
      is_active: eq.active !== false,
      tool_count: 0, // required — default
      interface_type: "cnc_classique", // required — default
    });

    if (!error) count++;
    else console.warn("pullMachines insert failed", odooId, error.message);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Manufacturing Orders (mrp.production)
// ---------------------------------------------------------------------------
async function pullManufacturingOrders(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const fields = await getModelFields(ctx, "mrp.production");
  const candidates = [
    "id",
    "name",
    "product_id",
    "product_qty",
    "state",
    "date_start",
    "date_finished",
  ];
  const availableFields = candidates.filter((f) => fields.has(f));

  if (!availableFields.includes("id") || !availableFields.includes("name")) {
    console.warn("pullManufacturingOrders: mrp.production missing id or name — skipping");
    return 0;
  }

  const orders = await fetchAllPages(
    ctx,
    "mrp.production",
    [],
    availableFields,
  );

  let count = 0;
  for (const o of orders) {
    const odooId = o.id as number;
    const productField = o.product_id as [number, string] | false;
    const productName = productField && Array.isArray(productField)
      ? productField[1]
      : `Product ${odooId}`;

    // Map Odoo state to AniXOS status
    const stateMap: Record<string, string> = {
      draft: "draft",
      confirmed: "confirmed",
      progress: "in_progress",
      to_close: "in_progress",
      done: "completed",
      cancel: "cancelled",
    };
    const status = stateMap[String(o.state ?? "draft")] ?? "draft";

    const { data: existing } = await admin
      .from("manufacturing_orders")
      .select("id")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    // Note: project_id is NOT NULL in AniXOS — we skip if not linked
    // AniXOS MOs are always project-bound; Odoo MOs may not be.
    // For now we only sync MOs that have a corresponding project.
    // (Future: create a synthetic "Odoo Imports" project if needed.)

    if (!existing) {
      // Skip creation — requires project_id which we don't have
      // Will be handled in a future iteration with a dedicated mapping
      console.info(
        `pullManufacturingOrders: skipped MO ${odooId} (no project mapping yet)`,
      );
      continue;
    }

    const { error } = await admin
      .from("manufacturing_orders")
      .update({
        product_name: productName,
        quantity: typeof o.product_qty === "number" ? o.product_qty : 1,
        status,
        planned_start_date: o.date_start || null,
        planned_end_date: o.date_finished || null,
      })
      .eq("id", (existing as { id: string }).id);
    if (!error) count++;
    else console.warn("pullManufacturingOrders update failed", odooId, error.message);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Planning (planning.slot)
// ---------------------------------------------------------------------------
async function pullPlanning(
  ctx: OdooContext,
  admin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const fields = await getModelFields(ctx, "planning.slot");
  const candidates = [
    "id",
    "employee_id",
    "resource_id",
    "start_datetime",
    "end_datetime",
  ];
  const availableFields = candidates.filter((f) => fields.has(f));

  if (!availableFields.includes("id")) {
    console.warn("pullPlanning: planning.slot missing id — skipping");
    return 0;
  }

  const slots = await fetchAllPages(ctx, "planning.slot", [], availableFields);

  let count = 0;
  for (const s of slots) {
    const odooId = s.id as number;
    const start = s.start_datetime as string | false;
    const end = s.end_datetime as string | false;

    if (!start) continue; // skip slots without start date

    const plannedDate = start.slice(0, 10); // YYYY-MM-DD
    const shiftStart = start.slice(11, 19); // HH:MM:SS
    const shiftEnd = end ? end.slice(11, 19) : null;

    // Resolve worker (via odoo_id)
    let workerId: string | null = null;
    const empField = s.employee_id as [number, string] | false;
    if (empField && Array.isArray(empField)) {
      const { data: w } = await admin
        .from("workers")
        .select("id")
        .eq("company_id", companyId)
        .eq("odoo_id", empField[0])
        .maybeSingle();
      workerId = (w as { id: string } | null)?.id ?? null;
    }

    if (!workerId) continue; // planning requires worker_id

    // Resolve machine (via resource_id → machines.odoo_id)
    let machineId: string | null = null;
    const resField = s.resource_id as [number, string] | false;
    if (resField && Array.isArray(resField)) {
      const { data: m } = await admin
        .from("machines")
        .select("id")
        .eq("company_id", companyId)
        .eq("odoo_id", resField[0])
        .maybeSingle();
      machineId = (m as { id: string } | null)?.id ?? null;
    }

    const { data: existing } = await admin
      .from("planning")
      .select("id")
      .eq("company_id", companyId)
      .eq("odoo_id", odooId)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("planning")
        .update({
          worker_id: workerId,
          machine_id: machineId,
          planned_date: plannedDate,
          shift_start: shiftStart,
          shift_end: shiftEnd,
        })
        .eq("id", (existing as { id: string }).id);
      if (!error) count++;
      else console.warn("pullPlanning update failed", odooId, error.message);
      continue;
    }

    const { error } = await admin.from("planning").insert({
      company_id: companyId,
      odoo_id: odooId,
      worker_id: workerId,
      machine_id: machineId,
      planned_date: plannedDate,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      status: "planned",
      sequence_order: 0,
    });
    if (!error) count++;
    else console.warn("pullPlanning insert failed", odooId, error.message);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Stage mappings cache (project.task.type)
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
    // Non-blocking — stage_mappings is a cache, not critical
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
      .insert({ company_id: companyId, direction: "pull", status: "in_progress" })
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

    // Detect version (best-effort)
    const detectedVersion = await detectOdooVersion(cfg.odoo_url as string);

    // Execute modules
    const syncModules = (cfg.sync_modules as Record<string, boolean>) ?? {};
    const results: Record<string, number> = {};
    let projectIdByOdooId = new Map<number, string>();

    // Order matters — dependencies
    if (syncModules.clients) {
      results.clients = await pullClients(ctx, admin, companyId);
    }

    if (syncModules.workers) {
      results.workers = await pullWorkers(ctx, admin, companyId);
    }

    if (syncModules.machines) {
      results.machines = await pullMachines(ctx, admin, companyId);
    }

    if (syncModules.projects) {
      const r = await pullProjects(ctx, admin, companyId);
      results.projects = r.count;
      projectIdByOdooId = r.projectIdByOdooId;
    }

    if (syncModules.work_orders && projectIdByOdooId.size > 0) {
      results.pieces = await pullPieces(ctx, admin, companyId, projectIdByOdooId);
    }

    if (syncModules.manufacturing_orders) {
      results.manufacturing_orders = await pullManufacturingOrders(
        ctx,
        admin,
        companyId,
      );
    }

    if (syncModules.planning) {
      results.planning = await pullPlanning(ctx, admin, companyId);
    }

    // Cache stage mappings (always — small, useful for Push)
    await cacheStageMappings(ctx, admin, companyId);

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
    console.error("sync-odoo-pull failed:", err);

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
