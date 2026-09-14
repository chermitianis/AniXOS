import { useEffect, useState, useCallback } from "react";
import { fetchWorkerSessionsToday } from "../api/kioskApi";
import type { WorkSession } from "../../../shared/types/database";

export interface SessionSummary {
  productiveSeconds: number;
  downtimeSeconds: number;
  tasksCount: number;
  stopsCount: number;
}

function computeSummary(sessions: WorkSession[]): SessionSummary {
  let productiveSeconds = 0;
  let downtimeSeconds = 0;
  let tasksCount = 0;
  let stopsCount = 0;

  for (const s of sessions) {
    if (s.voided_at) continue; // الأحداث الملغاة مستبعدة من كل الحسابات النهائية

    const duration =
      s.duration_seconds ?? Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000);

    if (s.session_type === "production") {
      productiveSeconds += duration;
      tasksCount++;
    } else {
      downtimeSeconds += duration;
      stopsCount++;
    }
  }

  return { productiveSeconds, downtimeSeconds, tasksCount, stopsCount };
}

export function useSessionSummary(workerId: string, refreshKey: unknown) {
  const [summary, setSummary] = useState<SessionSummary>({
    productiveSeconds: 0,
    downtimeSeconds: 0,
    tasksCount: 0,
    stopsCount: 0,
  });

  const reload = useCallback(async () => {
    const sessions = await fetchWorkerSessionsToday(workerId);
    setSummary(computeSummary(sessions));
  }, [workerId]);

  useEffect(() => {
    void reload();
    // إعادة الحساب كل 30 ثانية لتحديث مدة الجلسة المفتوحة حالياً تلقائياً
    const interval = setInterval(reload, 30_000);
    return () => clearInterval(interval);
    // refreshKey (مفاتيح الأحداث النشطة) يجبر إعادة التحميل الفوري عند التبديل
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, refreshKey]);

  return summary;
}
