import { useEffect, useState } from "react";
import { getPendingSyncCount } from "../../../lib/syncQueue";
import { connectivityMonitor } from "../../../lib/connectivity";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(connectivityMonitor.getStatus());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function refreshPending() {
      setPendingCount(await getPendingSyncCount());
    }

    void refreshPending();
    const interval = setInterval(refreshPending, 5000);

    const unsubscribe = connectivityMonitor.subscribe((status) => {
      setIsOnline(status);
      void refreshPending();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  return { isOnline, pendingCount };
}
