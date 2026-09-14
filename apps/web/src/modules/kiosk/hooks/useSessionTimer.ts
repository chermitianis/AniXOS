import { useEffect, useState } from "react";

/** يُرجع الوقت المنقضي منذ startedAt، مُحدَّثاً كل ثانية */
export function useSessionTimer(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (!startedAt) {
      setElapsed("00:00:00");
      return;
    }

    const startTime = new Date(startedAt).getTime();

    function tick() {
      const diffSeconds = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      const hours = Math.floor(diffSeconds / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      const seconds = diffSeconds % 60;
      setElapsed(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}
