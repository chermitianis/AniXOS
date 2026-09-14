import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { fetchPieceHandoffs } from "../api/kioskApi";

/** عدد رسائل Passation غير المقروءة على قطعة معيّنة، مع تحديث لحظي عبر
 * Realtime. لا يومض الزر إلا عند وجود رسالة فعلية بانتظار القراءة — وبمجرد
 * فتحها وتعليمها كمقروءة يتوقف الوميض فوراً (البند: تنبيه Passation). */
export function usePieceHandoffsUnread(pieceTaskId: string | null, workerId: string) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!pieceTaskId) {
      setUnreadCount(0);
      return;
    }
    const handoffs = await fetchPieceHandoffs(pieceTaskId);
    setUnreadCount(handoffs.filter((h) => !h.is_read && h.from_worker_id !== workerId).length);
  }, [pieceTaskId, workerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pieceTaskId) return;
    const channel = createSafeChannel(`piece-handoffs-unread-${pieceTaskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "piece_handoffs", filter: `piece_task_id=eq.${pieceTaskId}` },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pieceTaskId, refresh]);

  return { unreadCount, refresh };
}
