import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export interface OdooConfig {
  id: string;
  company_id: string;
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  is_active: boolean;
  sync_modules: {
    clients: boolean;
    projects: boolean;
    invoices: boolean;
    suppliers: boolean;
  };
  sync_direction: "pull" | "push" | "bidirectional";
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  notify_on_error: boolean;
  last_sync_at: string | null;
  last_sync_status: "success" | "failed" | "partial" | null;
  last_sync_error: string | null;
  last_test_at: string | null;
  last_test_status: "success" | "failed" | null;
  last_test_error: string | null;
  records_synced: number;
  created_at: string;
  updated_at: string;
}

interface SaveConfigInput {
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  api_key?: string;
  sync_modules: OdooConfig["sync_modules"];
  sync_direction: OdooConfig["sync_direction"];
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

interface Result {
  success: boolean;
  error?: string;
}

export function useOdooConfig() {
  const [config, setConfig] = useState<OdooConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------
  // Chargement initial
  // -------------------------------------------------------------------
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
      setConfig(data as OdooConfig | null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // -------------------------------------------------------------------
  // Enregistrement
  // -------------------------------------------------------------------
  const saveConfig = useCallback(
    async (input: SaveConfigInput): Promise<Result> => {
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

        if (fnError) {
          return { success: false, error: fnError.message };
        }
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

  // -------------------------------------------------------------------
  // Toggle activation
  // -------------------------------------------------------------------
  const toggleActive = useCallback(async (): Promise<Result> => {
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
      if (!data?.success) return { success: false, error: data?.message ?? "Erreur" };

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

  // -------------------------------------------------------------------
  // Test de connexion
  // -------------------------------------------------------------------
  const testConnection = useCallback(
    async (
      input: TestConnectionInput,
    ): Promise<{ ok: boolean; message: string }> => {
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
          message: data.message ?? `Connecté à Odoo (version ${data.version ?? "?"})`,
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

  return {
    config,
    isLoading,
    isSaving,
    error,
    saveConfig,
    toggleActive,
    testConnection,
    reload,
  };
}