// ============================================================================
// WorkerSessionContext: جلسة العامل داخل الكشك.
// هذه جلسة "منطقية" على مستوى التطبيق فقط، وليست Supabase Auth إطلاقاً —
// جلسة الجهاز نفسه (Device Auth Session) تبقى ثابتة في الخلفية طوال الوقت.
//
// حرج: تُخزَّن في localStorage (وليس sessionStorage) لأن المتطلب صريح:
// إغلاق التطبيق/المتصفح أو انقطاع الكهرباء أو إعادة تشغيل الجهاز يجب ألا
// يُنهي جلسة العامل أبداً — فقط تسجيل الخروج الصريح ينهيها.
//
// تدعم مسارين للتحقق من كلمة السر:
//   1) أونلاين: عبر worker-login Edge Function (تحقق آمن + قفل مركزي)
//   2) أوفلاين: عبر كاش bcrypt محلي (localDb.workerCredentials) + قفل محلي
//
// الفصل بين الحصة والحدث: تسجيل الدخول الحقيقي (وليس كل إعادة تحميل صفحة)
// يبدأ "حصة" (work_shifts) عبر startWorkerShift، وتسجيل الخروج الصريح فقط
// هو ما يُنهيها عبر endWorkerShift (والذي يُغلق أيضاً أي أحداث مفتوحة).
//
// ملاحظة معمارية مهمة: هذه الطبقة (منطق أعمال) لا تُعيد نصوصاً مترجَمة
// جاهزة أبداً، بل "مفتاح ترجمة" (messageKey) + معطياته. الترجمة الفعلية
// تحدث فقط في طبقة العرض (WorkerLoginPage) عبر t(). هذا يضمن عمل تبديل
// اللغة بشكل صحيح دون أي اعتماد هش على مطابقة نصوص حرفية.
// ============================================================================

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabaseClient";
import { localDb } from "../lib/localDb";
import { connectivityMonitor } from "../lib/connectivity";
import { enqueueSync } from "../lib/syncQueue";
import { getCachedCompanyIdSync } from "../lib/companyContext";
import { startWorkerShift, endWorkerShift, fetchOpenSessionsForWorker } from "../modules/kiosk/api/kioskApi";

const WORKER_SESSION_STORAGE_KEY = "anixos_worker_session";
const LOCAL_MAX_ATTEMPTS = 5;
const LOCAL_LOCK_MINUTES = 15;

export interface ActiveWorkerProfile {
  id: string;
  full_name: string;
  photo_url: string | null;
  session_started_at: string;
  /** حصة الدوام الحالية — تُغلق فقط عند تسجيل الخروج الصريح */
  shift_id: string;
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
  /** يتحقق من وجود أحداث نشطة على قطعة قبل الإغلاق، ليعرض المستدعي تأكيداً
   * واضحاً للعامل قبل المتابعة (البند 8) بدل السماح بخروج صامت */
  hasOpenPieceEvents: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const WorkerSessionContext = createContext<WorkerSessionState | undefined>(undefined);

function loadPersistedSession(): ActiveWorkerProfile | null {
  const raw = localStorage.getItem(WORKER_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveWorkerProfile>;
    // جلسات قديمة محفوظة قبل إضافة shift_id: غير صالحة، يجب إعادة الدخول
    if (!parsed.id || !parsed.shift_id) return null;
    return parsed as ActiveWorkerProfile;
  } catch {
    return null;
  }
}

async function loginOnline(username: string, password: string): Promise<WorkerLoginResult & { profile?: Omit<ActiveWorkerProfile, "shift_id"> }> {
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
    },
  };
}

async function loginOffline(username: string, password: string): Promise<WorkerLoginResult & { profile?: Omit<ActiveWorkerProfile, "shift_id"> }> {
  const cached = await localDb.workerCredentials.where("username").equals(username).first();

  if (!cached || !cached.is_active) {
    return { success: false, messageKey: "kioskLogin.invalidCredentialsOffline" };
  }

  if (cached.local_locked_until && new Date(cached.local_locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(cached.local_locked_until).getTime() - Date.now()) / 60000);
    return { success: false, messageKey: "kioskLogin.accountLockedLocal", messageParams: { minutes: minutesLeft } };
  }

  const matches = bcrypt.compareSync(password, cached.password_hash);

  if (!matches) {
    const newAttempts = cached.local_failed_attempts + 1;
    const shouldLock = newAttempts >= LOCAL_MAX_ATTEMPTS;
    await localDb.workerCredentials.update(cached.id, {
      local_failed_attempts: shouldLock ? 0 : newAttempts,
      local_locked_until: shouldLock
        ? new Date(Date.now() + LOCAL_LOCK_MINUTES * 60000).toISOString()
        : null,
    });
    return shouldLock
      ? { success: false, messageKey: "kioskLogin.accountLockedLocalNew", messageParams: { minutes: LOCAL_LOCK_MINUTES } }
      : { success: false, messageKey: "kioskLogin.invalidCredentialsOffline" };
  }

  await localDb.workerCredentials.update(cached.id, {
    local_failed_attempts: 0,
    local_locked_until: null,
  });

  const sessionStartedAt = new Date().toISOString();

  // نُسجِّل حدث الدخول في سجل الأحداث المحلي (سيُزامَن لاحقاً)، لأن
  // activity_log نفسه لا يُكتب مباشرة أوفلاين بل عبر الطابور فقط
  await enqueueSync("activity_log", "insert", {
    id: crypto.randomUUID(),
    company_id: getCachedCompanyIdSync(),
    worker_id: cached.id,
    event_type: "login",
    event_label: `${cached.full_name} — connexion hors ligne`,
    event_time: sessionStartedAt,
  });

  return {
    success: true,
    profile: {
      id: cached.id,
      full_name: cached.full_name,
      photo_url: cached.photo_url,
      session_started_at: sessionStartedAt,
    },
  };
}

export function WorkerSessionProvider({ children }: { children: ReactNode }) {
  const [activeWorker, setActiveWorker] = useState<ActiveWorkerProfile | null>(loadPersistedSession);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (activeWorker) {
      localStorage.setItem(WORKER_SESSION_STORAGE_KEY, JSON.stringify(activeWorker));
    } else {
      localStorage.removeItem(WORKER_SESSION_STORAGE_KEY);
    }
  }, [activeWorker]);

  async function login(username: string, password: string): Promise<WorkerLoginResult> {
    setIsLoggingIn(true);
    try {
      let result: WorkerLoginResult & { profile?: Omit<ActiveWorkerProfile, "shift_id"> };

      if (connectivityMonitor.getStatus()) {
        result = await loginOnline(username, password);
        // فشل الاتصال تحديداً (وليس خطأ بيانات) → نجرّب أوفلاين تلقائياً
        // (يُحدَّد عبر علم isConnectionError الصريح، وليس مطابقة نص هشة)
        if (!result.success && result.isConnectionError) {
          result = await loginOffline(username, password);
        }
      } else {
        result = await loginOffline(username, password);
      }

      if (result.success && result.profile) {
        // تبدأ الحصة هنا فقط — عند دخول حقيقي، وليس عند كل إعادة تحميل صفحة
        const shift = await startWorkerShift(result.profile.id, null);
        setActiveWorker({ ...result.profile, shift_id: shift.id });
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

  async function logout(): Promise<void> {
    if (!activeWorker) return;
    setIsLoggingOut(true);
    try {
      // تسجيل الخروج هو العملية الوحيدة التي تُنهي الحصة: يُغلق كل الأحداث
      // المفتوحة أولاً (تُحسب ضمن الوقت الفعلي) ثم يُغلق الحصة نفسها
      await endWorkerShift(activeWorker.shift_id, activeWorker.id);
    } finally {
      setActiveWorker(null);
      setIsLoggingOut(false);
    }
  }

  return (
    <WorkerSessionContext.Provider value={{ activeWorker, isLoggingIn, isLoggingOut, login, hasOpenPieceEvents, logout }}>
      {children}
    </WorkerSessionContext.Provider>
  );
}

export function useWorkerSession(): WorkerSessionState {
  const ctx = useContext(WorkerSessionContext);
  if (!ctx) throw new Error("useWorkerSession must be used within WorkerSessionProvider");
  return ctx;
}
