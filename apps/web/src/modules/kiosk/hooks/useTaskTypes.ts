import { useEffect, useState } from "react";
import { fetchTaskTypes } from "../api/kioskApi";
import { connectivityMonitor } from "../../../lib/connectivity";
import { resolveCompanyId } from "../../../lib/companyContext";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useWorkerSession } from "../../../auth/WorkerSessionContext";
import { filterByInterface } from "../../../shared/utils/interfaceFilter";
import type { TaskType } from "../../../shared/types/database";

/**
 * يجلب أنواع المهام الإنتاجية (العمود الأزرق) ويفلترها حسب interface_type
 * للعامل الحالي.
 */
export function useTaskTypes() {
  const { activeWorker } = useWorkerSession();
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const workerInterface = activeWorker?.interface_type ?? "both";

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const data = await fetchTaskTypes();
      if (isMounted) {
        setTaskTypes(filterByInterface(data, workerInterface));
        setIsLoading(false);
      }
    }

    void load();

    const unsubscribe = connectivityMonitor.subscribe((isOnline) => {
      if (isOnline) void load();
    });

    let channelCleanup: (() => void) | undefined;
    void resolveCompanyId().then((companyId) => {
      if (!isMounted || !companyId) return;
      const channel = createSafeChannel(`task-types-${companyId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "task_types", filter: `company_id=eq.${companyId}` },
          () => void load()
        )
        .subscribe();
      channelCleanup = () => void supabase.removeChannel(channel);
    });

    return () => {
      isMounted = false;
      unsubscribe();
      channelCleanup?.();
    };
  }, [workerInterface]);

  return { taskTypes, isLoading };
}