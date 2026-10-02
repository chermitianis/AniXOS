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
  loginWithToken: (rawToken: string, pin: string) => Promise<VerifyResult>;
  logout: () => void;
}

const PlanningSessionContext = createContext<PlanningSessionState | undefined>(undefined);

export function PlanningSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlanningSession | null>(() => loadPlanningSession());
  const [isVerifying, setIsVerifying] = useState(false);

  const loginWithToken = useCallback(async (rawToken: string, pin: string) => {
    setIsVerifying(true);
    try {
      const result = await verifyPlanningToken(rawToken, pin);
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