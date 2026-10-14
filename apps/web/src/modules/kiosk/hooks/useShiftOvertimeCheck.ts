import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const DEFAULT_SHIFT_HOURS = 8;
const DEFAULT_GRACE_MINUTES = 20;
const CHECK_INTERVAL_MS = 30_000;

export interface ShiftOvertimeCheck {
  /** true si l'opérateur a dépassé shift_hours + grace_minutes sans
   *  avoir ni confirmé "je continue" ni fermé son shift. */
  shouldPrompt: boolean;
  /** Nombre d'heures écoulées depuis le début du shift. */
  hoursOpen: number;
  /** À appeler après confirmation "je continue" — évite le re-prompt. */
  markExtended: () => void;
}

export function useShiftOvertimeCheck(
  shiftId: string | null | undefined,
  startedAt: string | null | undefined,
  shiftHours: number = DEFAULT_SHIFT_HOURS,
  graceMinutes: number = DEFAULT_GRACE_MINUTES,
): ShiftOvertimeCheck {
  const [extendedAt, setExtendedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Récupère `extended_at` une fois au mount
  useEffect(() => {
    if (!shiftId) return;
    let mounted = true;
    void supabase
      .from("work_shifts")
      .select("extended_at")
      .eq("id", shiftId)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted && data) {
          setExtendedAt((data as { extended_at?: string | null }).extended_at ?? null);
        }
      });
    return () => {
      mounted = false;
    };
  }, [shiftId]);

  // Re-tick toutes les 30s
  useEffect(() => {
    if (!shiftId) return;
    const id = setInterval(() => setNow(Date.now()), CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [shiftId]);

  const hoursOpen = startedAt
    ? (now - new Date(startedAt).getTime()) / 3_600_000
    : 0;

  const shouldPrompt =
    !!shiftId &&
    !!startedAt &&
    !extendedAt &&
    hoursOpen > shiftHours + graceMinutes / 60;

  const markExtended = useCallback(() => {
    setExtendedAt(new Date().toISOString());
  }, []);

  return { shouldPrompt, hoursOpen, markExtended };
}