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
import type { InterfaceType } from "../shared/types/database";
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
    return parsed as ActiveWorkerProfile;
  } catch {
    return null;
  }
}

async function loginOnline(
  username: string,
  password: string
): Promise<WorkerLoginResult & { profile?: Omit<ActiveWorkerProfile, "shift_id" | "device_name"> }> {
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

  // ✅ التحقق من صلاحية الجلسة المحفوظة في قاعدة البيانات عند التحميل
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

  // ✅ تحديث session_started_at (عند اختيار قطعة جديدة)
  const updateSessionStartedAt = useCallback((startedAt: string) => {
    setActiveWorker((prev) => (prev ? { ...prev, session_started_at: startedAt } : prev));
  }, []);

  async function login(username: string, password: string): Promise<WorkerLoginResult> {
    setIsLoggingIn(true);
    try {
      let result: WorkerLoginResult & { profile?: Omit<ActiveWorkerProfile, "shift_id" | "device_name"> };

      if (!connectivityMonitor.getStatus()) {
        return { success: false, messageKey: "kioskLogin.connectionRequired" };
      }

      result = await loginOnline(username, password);
      if (!result.success && result.isConnectionError) {
        return { success: false, messageKey: "kioskLogin.connectionRequired" };
      }

      if (result.success && result.profile) {
        // ✅ جلب device_id المحفوظ محلياً أو استرداده
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

        // ✅ جلب اسم الجهاز
        let deviceName = "—";
        const device = await fetchDeviceById(activeDeviceId);
        if (device) deviceName = device.device_name;

        // ✅ بدء الوردية (بدون deviceId)
        const shift = await startWorkerShift(result.profile.id);

// ✅ جلب الجلسات المفتوحة على هذا الجهاز من قاعدة البيانات مباشرة
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
  // Fallback: استخدام IndexedDB (قد لا يكون دقيقاً)
  const openSessions = await fetchOpenSessionsForWorker(result.profile.id);
  openSessionsOnDevice = openSessions.filter((s) => s.device_id === activeDeviceId);
}

if (openSessionsOnDevice.length > 0) {
  // ✅ هناك جلسة مفتوحة على هذا الجهاز -> استئنافها (باستخدام وقت الجلسة)
  const session = openSessionsOnDevice[0];
  await hydrateWorkerStateFromServer(result.profile.id, shift);
  setActiveWorker({
    ...result.profile,
    session_started_at: session.started_at, // ✅ وقت الجلسة
    shift_id: shift.id,
    device_name: deviceName,
  });
  return { success: true };
}

// ✅ لا توجد جلسة مفتوحة على هذا الجهاز -> استخدام وقت الوردية مؤقتاً
setActiveWorker({
  ...result.profile,
  session_started_at: shift.started_at, // مؤقتاً
  shift_id: shift.id,
  device_name: deviceName,
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

  // ✅ تصحيح: التحقق من الجلسات من قاعدة البيانات مباشرة (وليس IndexedDB المحلي)
  async function hasOtherOpenSessions(): Promise<boolean> {
    if (!activeWorker) return false;

    const currentDeviceId = getLocalDeviceId();
    if (!currentDeviceId) return false;

    if (connectivityMonitor.getStatus()) {
      const { data, error } = await supabase
        .from("work_sessions")
        .select("id, device_id")
        .eq("worker_id", activeWorker.id)
        .is("ended_at", null)
        .is("voided_at", null)
        .neq("device_id", currentDeviceId);

      if (!error && data) {
        return data.length > 0;
      }
    }

    // Fallback في حالة عدم الاتصال (قد لا يكون دقيقاً)
    const open = await fetchOpenSessionsForWorker(activeWorker.id);
    const otherSessions = open.filter((s) => s.device_id !== currentDeviceId);
    return otherSessions.length > 0;
  }

  async function logout(options?: { endShift?: boolean }): Promise<void> {
    if (!activeWorker) return;
    setIsLoggingOut(true);
    try {
      await endWorkerShift(activeWorker.shift_id, activeWorker.id, options);
    } finally {
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