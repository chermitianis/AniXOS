import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  clearPlanningSession,
  loadPlanningSession,
  savePlanningSession,
  verifyPlanningToken,
  type PlanningSession,
  type VerifyResult,
} from "../api/workerPlanningApi";

interface PlanningSessionState {
  session: PlanningSession | null;
  isVerifying: boolean;
  loginWithToken: (rawToken: string) => Promise<VerifyResult>;
  logout: () => void;
}

const PlanningSessionContext = createContext<PlanningSessionState | undefined>(undefined);

/** Session légère et 100% locale (pas de Supabase Auth) : le "login" n'est
 * qu'une vérification du token scanné auprès de l'Edge Function, puis un
 * enregistrement dans localStorage pour que l'opérateur n'ait plus jamais à
 * rescanner sur ce téléphone — jusqu'à une régénération du QR côté serveur. */
export function PlanningSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlanningSession | null>(() => loadPlanningSession());
  const [isVerifying, setIsVerifying] = useState(false);

  const loginWithToken = useCallback(async (rawToken: string) => {
    setIsVerifying(true);
    try {
      const result = await verifyPlanningToken(rawToken);
      if (result.ok) {
        savePlanningSession(result.session);
        setSession(result.session);
      }
      return result;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearPlanningSession();
    setSession(null);
  }, []);

  return (
    <PlanningSessionContext.Provider value={{ session, isVerifying, loginWithToken, logout }}>
      {children}
    </PlanningSessionContext.Provider>
  );
}

export function usePlanningSession(): PlanningSessionState {
  const ctx = useContext(PlanningSessionContext);
  if (!ctx) throw new Error("usePlanningSession doit être utilisé dans PlanningSessionProvider");
  return ctx;
}
