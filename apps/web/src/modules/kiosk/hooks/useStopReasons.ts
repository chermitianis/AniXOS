import { useEffect, useState } from "react";
import { fetchStopReasons } from "../api/kioskApi";
import { connectivityMonitor } from "../../../lib/connectivity";
import { resolveCompanyId } from "../../../lib/companyContext";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useWorkerSession } from "../../../auth/WorkerSessionContext";
import { filterByInterface } from "../../../shared/utils/interfaceFilter";
import type { StopReason } from "../../../shared/types/database";

/**
 * يجلب أسباب التوقف (العمود البرتقالي) ويفلترها حسب interface_type للعامل
 * بنفس منطق useTaskTypes (انظر التعليق هناك).
 */
export function useStopReasons() {
  const { activeWorker } = useWorkerSession();
  const [stopReasons, setStopReasons] = useState<StopReason[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const workerInterface = activeWorker?.interface_type ?? "both";

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const data = await fetchStopReasons();
      if (isMounted) {
        setStopReasons(filterByInterface(data, workerInterface));
        setIsLoading(false);
      }
    }

    void load();

    const unsubscribe = connectivityMonitor.subscribe((isOnline) => {
      if (isOnline) void load();
    });

    // بث حي: أي تعديل على أسباب التوقف من الإدارة يظهر فوراً في الكشك
    let channelCleanup: (() => void) | undefined;
    void resolveCompanyId().then((companyId) => {
      if (!isMounted || !companyId) return;
      const channel = createSafeChannel(`stop-reasons-${companyId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stop_reasons", filter: `company_id=eq.${companyId}` },
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

  return { stopReasons, isLoading };
}