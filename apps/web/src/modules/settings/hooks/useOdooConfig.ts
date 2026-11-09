// ============================================================================
// apps/web/src/modules/settings/hooks/useOdooConfig.ts
//
// Hook for managing Odoo integration configuration.
// - Supports new matrix structure: { clients: { pull: true, push: false } }
// - Backward compatible with legacy structure: { clients: true }
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

// ---------------------------------------------------------------------------
// Types
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

// ✅ البنية الجديدة: لكل وحدة خياران (pull / push)
export type ModuleDirection = { pull: boolean; push: boolean };

// ✅ البنية الجديدة: مصفوفة من ModuleDirection
export type SyncModulesMatrix = Record<SyncModule, ModuleDirection>;

// ⚠️ البنية القديمة (للتوافق فقط): لكل وحدة قيمة boolean
export type LegacySyncModules = Record<SyncModule, boolean>;

// ✅ النوع الموحد (يستخدم في OdooConfig)
export type SyncModules = SyncModulesMatrix | LegacySyncModules;

export type SyncDirection = "pull" | "push" | "bidirectional";
export type SyncStatus = "success" | "failed" | "partial";
export type TestStatus = "success" | "failed";

/**
 * Default sync modules (matrix structure) — mirrors the DB default.
 */
export const DEFAULT_SYNC_MODULES: SyncModulesMatrix = {
  clients: { pull: true, push: false },
  suppliers: { pull: false, push: false },
  projects: { pull: false, push: false },
  manufacturing_orders: { pull: false, push: false },
  work_orders: { pull: false, push: false },
  machines: { pull: false, push: false },
  workcenters: { pull: false, push: false },
  workers: { pull: false, push: false },
  staff: { pull: false, push: false },
  planning: { pull: false, push: false },
  materials: { pull: false, push: false },
  invoices: { pull: false, push: false },
};

/**
 * Ordered list of all sync modules — for UI rendering.
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

/**
 * ✅ دالة مساعدة: تحويل البنية القديمة (Legacy) إلى الجديدة (Matrix).
 * - إذا كانت القيمة `true`، تصبح `{ pull: true, push: true }`.
 * - إذا كانت القيمة `false`، تصبح `{ pull: false, push: false }`.
 * - إذا كانت القيمة `undefined`، تصبح `{ pull: false, push: false }`.
 */
export function normalizeSyncModules(
  modules: SyncModules | null | undefined,
): SyncModulesMatrix {
  if (!modules) return DEFAULT_SYNC_MODULES;

  const result = {} as SyncModulesMatrix;
  for (const key of ALL_SYNC_MODULES) {
    const value = modules[key];
    if (typeof value === "boolean") {
      // البنية القديمة
      result[key] = { pull: value, push: value };
    } else if (value && typeof value === "object") {
      // البنية الجديدة
      result[key] = { pull: !!value.pull, push: !!value.push };
    } else {
      // غير موجود
      result[key] = { pull: false, push: false };
    }
  }
  return result;
}

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
  sync_modules: SyncModulesMatrix; // ✅ البنية الجديدة
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

  const isAutoSyncing = useRef(false);

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------
  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
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
  // Auto-Sync Background Polling
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!config?.is_active) return;

    const interval = setInterval(async () => {
      if (isAutoSyncing.current) return;
      isAutoSyncing.current = true;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;

        await supabase.functions.invoke("sync-odoo-pull", {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        await reload();
      } catch (err) {
        console.warn("Auto-sync background pull failed", err);
      } finally {
        isAutoSyncing.current = false;
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [config?.is_active, reload]);

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
  // Pull
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
  // Push
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