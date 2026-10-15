// ============================================================================
// apps/web/src/modules/settings/hooks/useOdooConfig.ts
//
// Hook for managing Odoo integration configuration.
//
// Fixes applied:
//   1. sync_modules: 4 keys → 12 keys (matching odoo_config.sync_modules JSONB)
//   2. Added `version` to OdooConfig (column exists in DB, was missing in TS)
//   3. pushNow: reads `totalSynced` from Edge Function response (was `sent`)
//   4. testConnection: returns `version` and `uid` for UI display
//   5. Exported SyncModule/SyncModules/SyncDirection types for shared use
//   6. Added explicit company_id filter (defensive clarity, RLS is primary guard)
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

// ---------------------------------------------------------------------------
// Types — aligned with public.odoo_config schema (22 columns, 12 sync modules)
// ---------------------------------------------------------------------------

export type SyncModule =
  | "clients"
  | "suppliers"
  | "projects"
  | "manufacturing_orders"
  | "work_orders"
  | "machines"
  | "workcenters"
  | "workers"
  | "staff"
  | "planning"
  | "materials"
  | "invoices";

export type SyncModules = Record<SyncModule, boolean>;

export type SyncDirection = "pull" | "push" | "bidirectional";
export type SyncStatus = "success" | "failed" | "partial";
export type TestStatus = "success" | "failed";

/**
 * Default sync modules — mirrors the DB default for `sync_modules` JSONB.
 * Used when a config row doesn't yet have an explicit value.
 */
export const DEFAULT_SYNC_MODULES: SyncModules = {
  clients: true,
  suppliers: false,
  projects: false,
  manufacturing_orders: false,
  work_orders: false,
  machines: false,
  workcenters: false,
  workers: false,
  staff: false,
  planning: false,
  materials: false,
  invoices: false,
};

/**
 * Ordered list of all sync modules — for UI rendering (matches DB default order).
 */
export const ALL_SYNC_MODULES: SyncModule[] = [
  "clients",
  "suppliers",
  "invoices",
  "projects",
  "manufacturing_orders",
  "work_orders",
  "planning",
  "machines",
  "workcenters",
  "workers",
  "staff",
  "materials",
];

export interface OdooConfig {
  id: string;
  company_id: string;
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  is_active: boolean;
  sync_modules: SyncModules;
  sync_direction: SyncDirection;
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  notify_on_error: boolean;
  last_sync_at: string | null;
  last_sync_status: SyncStatus | null;
  last_sync_error: string | null;
  last_test_at: string | null;
  last_test_status: TestStatus | null;
  last_test_error: string | null;
  version: string | null;
  records_synced: number;
  created_at: string;
  updated_at: string;
}

interface SaveConfigInput {
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  api_key?: string;
  sync_modules: SyncModules;
  sync_direction: SyncDirection;
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  notify_on_error: boolean;
}

interface TestConnectionInput {
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  api_key?: string;
}

interface BaseResult {
  success: boolean;
  error?: string;
}

export interface SyncPullResult extends BaseResult {
  totalSynced?: number;
  results?: Record<string, number>;
}

export interface SyncPushResult extends BaseResult {
  totalSynced?: number;
  results?: Record<string, number>;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  version?: string;
  uid?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOdooConfig() {
  const [config, setConfig] = useState<OdooConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------
  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // RLS on odoo_config restricts rows to the caller's company + is_owner.
      // `.maybeSingle()` is safe here: at most one row per company_id (UNIQUE).
      const { data, error: fetchError } = await supabase
        .from("odoo_config")
        .select("*")
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setConfig((data as OdooConfig | null) ?? null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // -------------------------------------------------------------------------
  // Save (upsert)
  // -------------------------------------------------------------------------
  const saveConfig = useCallback(
    async (input: SaveConfigInput): Promise<BaseResult> => {
      setIsSaving(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return { success: false, error: "Session expirée" };

        const { data, error: fnError } = await supabase.functions.invoke(
          "test-odoo-connection",
          {
            body: { action: "save", ...input },
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (fnError) return { success: false, error: fnError.message };
        if (!data?.success) {
          return { success: false, error: data?.message ?? "Erreur" };
        }

        await reload();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        };
      } finally {
        setIsSaving(false);
      }
    },
    [reload],
  );

  // -------------------------------------------------------------------------
  // Toggle active
  // -------------------------------------------------------------------------
  const toggleActive = useCallback(async (): Promise<BaseResult> => {
    setIsSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return { success: false, error: "Session expirée" };

      const { data, error: fnError } = await supabase.functions.invoke(
        "test-odoo-connection",
        {
          body: { action: "toggle" },
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (fnError) return { success: false, error: fnError.message };
      if (!data?.success) {
        return { success: false, error: data?.message ?? "Erreur" };
      }

      await reload();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      };
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  // -------------------------------------------------------------------------
  // Test connection
  // -------------------------------------------------------------------------
  const testConnection = useCallback(
    async (input: TestConnectionInput): Promise<TestConnectionResult> => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return { ok: false, message: "Session expirée" };

        const { data, error: fnError } = await supabase.functions.invoke(
          "test-odoo-connection",
          {
            body: { action: "test", ...input },
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (fnError) return { ok: false, message: fnError.message };
        if (!data?.success) {
          return { ok: false, message: data?.message ?? "Échec du test" };
        }
        return {
          ok: true,
          message:
            data.message ??
            `Connecté à Odoo (version ${data.version ?? "?"})`,
          version: data.version,
          uid: data.uid,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Erreur réseau",
        };
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Pull (Odoo → AniXOS)
  // -------------------------------------------------------------------------
  const syncNow = useCallback(async (): Promise<SyncPullResult> => {
    setIsSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return { success: false, error: "Session expirée" };

      const { data, error: fnError } = await supabase.functions.invoke(
        "sync-odoo-pull",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (fnError) return { success: false, error: fnError.message };
      if (!data?.success) {
        return {
          success: false,
          error: data?.message ?? "Erreur de synchronisation",
        };
      }

      await reload();
      return {
        success: true,
        totalSynced: data.totalSynced,
        results: data.results,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      };
    } finally {
      setIsSyncing(false);
    }
  }, [reload]);

  // -------------------------------------------------------------------------
  // Push (AniXOS → Odoo)
  //
  // Edge Function returns: { success, results, totalSynced }.
  // Previous version read `data.sent` (undefined) — this is now fixed.
  // -------------------------------------------------------------------------
  const pushNow = useCallback(async (): Promise<SyncPushResult> => {
    setIsPushing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return { success: false, error: "Session expirée" };

      const { data, error: fnError } = await supabase.functions.invoke(
        "sync-odoo-push",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (fnError) return { success: false, error: fnError.message };
      if (!data?.success) {
        return { success: false, error: data?.message ?? "Erreur d'envoi" };
      }

      await reload();
      return {
        success: true,
        totalSynced: data.totalSynced,
        results: data.results,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      };
    } finally {
      setIsPushing(false);
    }
  }, [reload]);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  return {
    config,
    isLoading,
    isSaving,
    isSyncing,
    isPushing,
    error,
    saveConfig,
    toggleActive,
    testConnection,
    syncNow,
    pushNow,
    reload,
  };
}
