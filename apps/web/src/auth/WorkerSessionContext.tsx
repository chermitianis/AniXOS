// ============================================================================
// WorkerSessionContext: جلسة العامل داخل الكشك.
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { connectivityMonitor } from "../lib/connectivity";
import {
  startWorkerShift,
  endWorkerShift,
  fetchOpenSessionsForWorker,
  fetchOpenShiftForWorker,
  hydrateWorkerStateFromServer,
} from "../modules/kiosk/api/kioskApi";
import type { InterfaceType, WorkSession } from "../shared/types/database";
import {
  getLocalDeviceId,
  recoverDeviceIdFromFingerprint,
  fetchDeviceById,
} from "../lib/deviceContext";
import { resolveCompanyId } from "../lib/companyContext";

const WORKER_SESSION_STORAGE_KEY = "anixos_worker_session";

export interface ActiveWorkerProfile {
  id: string;
  full_name: string;
  photo_url: string | null;
  session_started_at: string;
  shift_id: string;
  interface_type: InterfaceType;
  device_name: string;
  machine_id: string | null;
}

export interface WorkerLoginResult {
  success: boolean;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  isConnectionError?: boolean;
}

interface WorkerSessionState {
  activeWorker: ActiveWorkerProfile | null;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
  login: (username: string, password: string) => Promise<WorkerLoginResult>;
  hasOpenPieceEvents: () => Promise<boolean>;
  hasOtherOpenSessions: () => Promise<boolean>;
  logout: (options?: { endShift?: boolean }) => Promise<void>;
  updateSessionStartedAt: (startedAt: string) => void;
}

const WorkerSessionContext = createContext<WorkerSessionState | undefined>(undefined);

function loadPersistedSession(): ActiveWorkerProfile | null {
  const raw = localStorage.getItem(WORKER_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveWorkerProfile>;
    if (!parsed.id || !parsed.shift_id || !parsed.interface_type || !parsed.device_name) {
      return null;
    }
    if (!("machine_id" in parsed)) return null;
    return parsed as ActiveWorkerProfile;
  } catch {
    return null;
  }
}

async function loginOnline(
  username: string,
  password: string
): Promise<WorkerLoginResult & { profile?: Omit<ActiveWorkerProfile, "shift_id" | "device_name" | "machine_id"> }> {
  const { data, error } = await supabase.functions.invoke("worker-login", {
    body: { username, password },
  });

  if (error) {
    return { success: false, isConnectionError: true, messageKey: "kioskLogin.connectionError" };
  }

  if (!data?.success) {
    return { success: false, messageKey: "kioskLogin.invalidCredentials" };
  }

  return {
    success: true,
    profile: {
      id: data.worker.id,
      full_name: data.worker.full_name,
      photo_url: data.worker.photo_url,
      session_started_at: data.session_started_at,
      interface_type: (data.worker.interface_type ?? "both") as InterfaceType,
    },
  };
}

export function WorkerSessionProvider({ children }: { children: ReactNode }) {
  const [activeWorker, setActiveWorker] = useState<ActiveWorkerProfile | null>(loadPersistedSession);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function validatePersistedSession() {
      if (!activeWorker) return;

      try {
        const { data, error } = await supabase
          .from("work_shifts")
          .select("id, ended_at")
          .eq("id", activeWorker.shift_id)
          .maybeSingle();

        if (error || !data || data.ended_at !== null) {
          setActiveWorker(null);
          localStorage.removeItem(WORKER_SESSION_STORAGE_KEY);
        }
      } catch {
        if (connectivityMonitor.getStatus()) {
          setActiveWorker(null);
          localStorage.removeItem(WORKER_SESSION_STORAGE_KEY);
        }
      }
    }

    void validatePersistedSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeWorker) {
      localStorage.setItem(WORKER_SESSION_STORAGE_KEY, JSON.stringify(activeWorker));
    } else {
      localStorage.removeItem(WORKER_SESSION_STORAGE_KEY);
    }
  }, [activeWorker]);

  const updateSessionStartedAt = useCallback((startedAt: string) => {
    setActiveWorker((prev) => (prev ? { ...prev, session_started_at: startedAt } : prev));
  }, []);

  async function login(username: string, password: string): Promise<WorkerLoginResult> {
    setIsLoggingIn(true);
    try {
      let result: WorkerLoginResult & { profile?: Omit<ActiveWorkerProfile, "shift_id" | "device_name" | "machine_id"> };

      if (!connectivityMonitor.getStatus()) {
        return { success: false, messageKey: "kioskLogin.connectionRequired" };
      }

      result = await loginOnline(username, password);
      if (!result.success && result.isConnectionError) {
        return { success: false, messageKey: "kioskLogin.connectionRequired" };
      }

      if (result.success && result.profile) {
        let activeDeviceId = getLocalDeviceId();
        if (!activeDeviceId) {
          const companyId = await resolveCompanyId();
          if (companyId) {
            activeDeviceId = await recoverDeviceIdFromFingerprint(companyId);
          }
        }

        if (!activeDeviceId) {
          return { success: false, messageKey: "kioskLogin.deviceNotRegistered" };
        }

        let deviceName = "—";
        let machineId: string | null = null;
        const device = await fetchDeviceById(activeDeviceId);
        if (device) {
          deviceName = device.device_name;
          machineId = device.default_machine_id;
        }

        const shift = await startWorkerShift(result.profile.id);

        // ✅ البحث عن جلسة مفتوحة على هذا الجهاز
        let openSessionsOnDevice: WorkSession[] = [];

        if (connectivityMonitor.getStatus()) {
          const { data: sessions, error } = await supabase
            .from("work_sessions")
            .select("*")
            .eq("worker_id", result.profile.id)
            .eq("device_id", activeDeviceId)
            .is("ended_at", null)
            .is("voided_at", null);

          if (!error && sessions) {
            openSessionsOnDevice = sessions as WorkSession[];
          }
        } else {
          const openSessions = await fetchOpenSessionsForWorker(result.profile.id);
          openSessionsOnDevice = openSessions.filter((s) => s.device_id === activeDeviceId);
        }

        if (openSessionsOnDevice.length > 0) {
          // ✅ هناك جلسة مفتوحة -> استئنافها
          const session = openSessionsOnDevice[0];
          await hydrateWorkerStateFromServer(result.profile.id, shift);
          setActiveWorker({
            ...result.profile,
            session_started_at: session.started_at, // ✅ وقت الجلسة (استئناف)
            shift_id: shift.id,
            device_name: deviceName,
            machine_id: machineId,
          });
          return { success: true };
        }

        // ✅ لا توجد جلسة مفتوحة -> الوقت الحالي (يبدأ من الصفر)
        setActiveWorker({
          ...result.profile,
          session_started_at: new Date().toISOString(), // ✅ الوقت الحالي
          shift_id: shift.id,
          device_name: deviceName,
          machine_id: machineId,
        });
        return { success: true };
      }

      return { success: false, messageKey: result.messageKey, messageParams: result.messageParams };
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function hasOpenPieceEvents(): Promise<boolean> {
    if (!activeWorker) return false;
    const open = await fetchOpenSessionsForWorker(activeWorker.id);
    return open.some((s) => Boolean(s.piece_task_id));
  }

  // ✅ التحقق من وجود وردية مفتوحة (وليس جلسات)
  async function hasOtherOpenSessions(): Promise<boolean> {
    if (!activeWorker) return false;

    if (connectivityMonitor.getStatus()) {
      const { data, error } = await supabase
        .from("work_shifts")
        .select("id")
        .eq("worker_id", activeWorker.id)
        .is("ended_at", null)
        .maybeSingle();

      if (!error && data) {
        return true; // ✅ هناك وردية مفتوحة -> لا تظهر "Fin de poste"
      }
      return false;
    }

    const shift = await fetchOpenShiftForWorker(activeWorker.id);
    return shift !== null;
  }

  async function logout(options?: { endShift?: boolean }): Promise<void> {
    if (!activeWorker) return;
    setIsLoggingOut(true);
    try {
      await endWorkerShift(activeWorker.shift_id, activeWorker.id, options);
    } finally {
      localStorage.removeItem(WORKER_SESSION_STORAGE_KEY);
      setActiveWorker(null);
      setIsLoggingOut(false);
    }
  }

  return (
    <WorkerSessionContext.Provider
      value={{
        activeWorker,
        isLoggingIn,
        isLoggingOut,
        login,
        hasOpenPieceEvents,
        hasOtherOpenSessions,
        logout,
        updateSessionStartedAt,
      }}
    >
      {children}
    </WorkerSessionContext.Provider>
  );
}

export function useWorkerSession(): WorkerSessionState {
  const ctx = useContext(WorkerSessionContext);
  if (!ctx) throw new Error("useWorkerSession must be used within WorkerSessionProvider");
  return ctx;
}