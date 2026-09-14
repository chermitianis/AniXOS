import { useEffect, useState } from "react";
import { fetchTaskTypes } from "../api/kioskApi";
import { connectivityMonitor } from "../../../lib/connectivity";
import { resolveCompanyId } from "../../../lib/companyContext";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import type { TaskType } from "../../../shared/types/database";

export function useTaskTypes() {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const data = await fetchTaskTypes();
      if (isMounted) {
        setTaskTypes(data);
        setIsLoading(false);
      }
    }

    void load();

    // إعادة التحميل عند عودة الاتصال لضمان أحدث قائمة (قد تكون تغيّرت من الإعداد)
    const unsubscribe = connectivityMonitor.subscribe((isOnline) => {
      if (isOnline) void load();
    });

    // بث حي: أي إضافة/تعديل/حذف لنوع مهمة من واجهة الإدارة يظهر فوراً في
    // الكشك دون أي تحديث يدوي — البند 11 (التزامن اللحظي)
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
  }, []);

  return { taskTypes, isLoading };
}
