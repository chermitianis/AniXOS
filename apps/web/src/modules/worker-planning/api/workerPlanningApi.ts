import { supabase } from "../../../lib/supabaseClient";
import { parsePlanningQrToken } from "../../../shared/utils/planningQrToken";

// ============================================================================
// Client de la PWA Planning opérateur (/planning). Aucune session Supabase
// Auth ici : l'app ne connaît que { companyId, secret, workerId, workerName }
// (venant du QR + PIN vérifié), revérifiés par l'Edge Function
// `worker-planning-access` à chaque appel.
// Lecture seule stricte — cette API n'écrit jamais rien.
// ============================================================================

export interface PlanningSession {
  companyId: string;
  secret: string;
  companyName: string;
  /** Identifiant de l'opérateur authentifié par son PIN (2FA). */
  workerId: string;
  workerName: string;
  interfaceType: string;
}

export interface PlanningRow {
  planning_id: string;
  machine_id: string;
  machine_name: string;
  project_id: string | null;
  project_name: string | null;
  piece_task_id: string | null;
  piece_ref: string | null;
  quantity: number | null;
  material: string | null;
  client_name: string | null;
  planned_date: string;
  status: string;
  worker_id: string;
  worker_name: string;
  shift_number: string | null;
}

const SESSION_KEY = "anixos_planning_session";
const CACHE_PREFIX = "anixos_planning_cache:";

export function loadPlanningSession(): PlanningSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PlanningSession) : null;
  } catch {
    return null;
  }
}

export function savePlanningSession(session: PlanningSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* stockage indisponible — l'opérateur devra rescanner à chaque ouverture */
  }
}

export function clearPlanningSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignoré */
  }
}

export type VerifyResult =
  | { ok: true; session: PlanningSession }
  | {
      ok: false;
      error:
        | "invalid_token"
        | "invalid_pin"
        | "pin_not_set"
        | "subscription_required"
        | "network_error";
    };

export async function verifyPlanningToken(
  rawToken: string,
  pin: string,
): Promise<VerifyResult> {
  const parsed = parsePlanningQrToken(rawToken);
  if (!parsed) return { ok: false, error: "invalid_token" };

  try {
    const { data, error } = await supabase.functions.invoke("worker-planning-access", {
      body: {
        action: "verify",
        company_id: parsed.companyId,
        secret: parsed.secret,
        pin,
      },
    });

    if (error || !data?.success) {
      const rawErr = data?.error;
      if (rawErr === "subscription_required") return { ok: false, error: "subscription_required" };
      if (rawErr === "invalid_pin") return { ok: false, error: "invalid_pin" };
      if (rawErr === "pin_not_set") return { ok: false, error: "pin_not_set" };
      return { ok: false, error: "invalid_token" };
    }

    return {
      ok: true,
      session: {
        companyId: parsed.companyId,
        secret: parsed.secret,
        companyName: data.company_name ?? "",
        workerId: data.worker_id ?? "",
        workerName: data.worker_name ?? "",
        interfaceType: data.interface_type ?? "both",
      },
    };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export interface FetchPlanningResult {
  rows: PlanningRow[];
  fetchedAt: string | null;
  fromCache: boolean;
  error?: "invalid_token" | "subscription_required" | "network_error" | "fetch_failed";
}

function cacheKey(companyId: string, date: string) {
  return `${CACHE_PREFIX}${companyId}:${date}`;
}

function readCache(companyId: string, date: string): { rows: PlanningRow[]; fetchedAt: string } | null {
  try {
    const raw = localStorage.getItem(cacheKey(companyId, date));
    return raw ? (JSON.parse(raw) as { rows: PlanningRow[]; fetchedAt: string }) : null;
  } catch {
    return null;
  }
}

function writeCache(companyId: string, date: string, rows: PlanningRow[], fetchedAt: string) {
  try {
    localStorage.setItem(cacheKey(companyId, date), JSON.stringify({ rows, fetchedAt }));
  } catch {
    /* quota dépassé ou navigation privée */
  }
}

export async function fetchPlanningForDate(
  session: PlanningSession,
  date: string,
): Promise<FetchPlanningResult> {
  try {
    const { data, error } = await supabase.functions.invoke("worker-planning-access", {
      body: { action: "fetch", company_id: session.companyId, secret: session.secret, date },
    });

    if (error || !data?.success) {
      const cached = readCache(session.companyId, date);
      if (cached) return { ...cached, fromCache: true };
      const errCode = data?.error === "subscription_required" ? "subscription_required" : "invalid_token";
      return { rows: [], fetchedAt: null, fromCache: false, error: errCode };
    }

    const fetchedAt = data.server_time ?? new Date().toISOString();
    writeCache(session.companyId, date, data.rows ?? [], fetchedAt);
    return { rows: data.rows ?? [], fetchedAt, fromCache: false };
  } catch {
    const cached = readCache(session.companyId, date);
    if (cached) return { ...cached, fromCache: true };
    return { rows: [], fetchedAt: null, fromCache: false, error: "network_error" };
  }
}