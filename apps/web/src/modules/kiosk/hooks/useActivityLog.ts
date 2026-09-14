import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { fetchWorkerActivityToday } from "../api/kioskApi";
import { connectivityMonitor } from "../../../lib/connectivity";
import type { ActivityLogEntry } from "../../../shared/types/database";

export function useActivityLog(workerId: string) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);

  const reload = useCallback(async () => {
    const data = await fetchWorkerActivityToday(workerId);
    setEntries(data as ActivityLogEntry[]);
  }, [workerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // بث حي: أي حدث جديد يُدرَج للعامل الحالي يظهر فوراً دون إعادة تحميل يدوية
  useEffect(() => {
    if (!connectivityMonitor.getStatus()) return;

    const channel = createSafeChannel(`activity-log-${workerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log", filter: `worker_id=eq.${workerId}` },
        () => void reload()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workerId, reload]);

  // إعادة تحميل أيضاً عند عودة الاتصال (لدمج ما تراكم محلياً مع الخادم)
  useEffect(() => {
    return connectivityMonitor.subscribe((isOnline) => {
      if (isOnline) void reload();
    });
  }, [reload]);

  return { entries, reload };
}
