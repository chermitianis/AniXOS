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
//   2) بعد الدخول: تستمر الجلسة المفتوحة أوفلاين، لكن لا يبدأ دخول جديد
//      أوفلاين لأن قفل الجهاز الواحد يحتاج تحققاً مركزياً.
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
import { supabase } from "../lib/supabaseClient";
import { connectivityMonitor } from "../lib/connectivity";
import {
  startWorkerShift,
  endWorkerShift,
  fetchOpenSessionsForWorker,
  fetchOpenShiftForWorker,
  hydrateWorkerStateFromServer,
  WorkerAlreadyConnectedError,
} from "../modules/kiosk/api/kioskApi";
import type { InterfaceType } from "../shared/types/database";

const WORKER_SESSION_STORAGE_KEY = "anixos_worker_session";

export interface ActiveWorkerProfile {
  id: string;
  full_name: string;
  photo_url: string | null;
  session_started_at: string;
  /** حصة الدوام الحالية — تُغلق فقط عند تسجيل الخروج الصريح */
  shift_id: string;
  /**
   * نوع واجهة العامل: 'cnc' | 'classique' | 'both' | 'manual'.
   * يحدد أي أزرار (task_types + stop_reasons) تظهر له في الكشك.
   */
  interface_type: InterfaceType;
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
    // جلسات قديمة محفوظة قبل إضافة shift_id أو interface_type: غير صالحة،
    // يجب إعادة الدخول للحصول على البيانات الكاملة من السيرفر.
    if (!parsed.id || !parsed.shift_id || !parsed.interface_type) return null;
    return parsed as ActiveWorkerProfile;
  } catch {
    return null;
  }
}

async function loginOnline(
  username: string,
  password: string
): Promise<WorkerLoginResult & { profile?: Omit<ActiveWorkerProfile, "shift_id"> }> {
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
      // يُرجعه worker-login Edge Function؛ fallback 'both' إن لم يُرجع
      // (لجلسات محفوظة قبل النشر أو للتوافق الخلفي)
      interface_type: (data.worker.interface_type ?? "both") as InterfaceType,
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

      // لا يمكن ضمان قفل جهاز واحد أثناء غياب الخادم؛ لذلك لا نسمح
      // بتسجيل دخول جديد للعامل أوفلاين. الجلسة المفتوحة تستمر بالعمل
      // أوفلاين، لكن إنشاء جلسة جديدة يتطلب تحققاً مركزياً.
      if (!connectivityMonitor.getStatus()) {
        return { success: false, messageKey: "kioskLogin.connectionRequired" };
      }

      result = await loginOnline(username, password);
      if (!result.success && result.isConnectionError) {
        return { success: false, messageKey: "kioskLogin.connectionRequired" };
      }

      if (result.success && result.profile) {
        // تبدأ الحصة هنا فقط — عند دخول حقيقي، وليس عند كل إعادة تحميل صفحة
        try {
          const shift = await startWorkerShift(result.profile.id, null);
          setActiveWorker({ ...result.profile, shift_id: shift.id });
          return { success: true };
        } catch (error) {
          const isAlreadyConnected =
            error instanceof WorkerAlreadyConnectedError ||
            (error instanceof Error && error.message === "WORKER_ALREADY_CONNECTED");
          if (!isAlreadyConnected) throw error;

          // كلمة السر صحيحة، لكن توجد حصة مفتوحة أصلاً لهذا العامل نفسه —
          // الأرجح أن بيانات الجهاز الذي بدأ بها الحصة فُقدت (متصفح مُفرَّغ،
          // جهاز آخر) وليس أن العامل يعمل فعلياً على جهازين في آن واحد.
          // نستأنف نفس الحصة بمعطياتها الحقيقية من السيرفر بدل رفض الدخول.
          const existingShift = await fetchOpenShiftForWorker(result.profile.id);
          if (!existingShift) {
            // حالة سباق نادرة: الحصة أُغلقت للتو بين الفحصين — أعد المحاولة
            return { success: false, messageKey: "kioskLogin.alreadyConnected" };
          }

          await hydrateWorkerStateFromServer(result.profile.id, existingShift);
          setActiveWorker({
            ...result.profile,
            // وقت البدء الحقيقي للحصة الأصلية، وليس لحظة إعادة الاتصال هذه —
            // حتى لا يُعاد احتساب التايمر من الصفر ويُفقَد الوقت الفعلي المنقضي
            session_started_at: existingShift.started_at,
            shift_id: existingShift.id,
          });
          return { success: true };
        }
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
    <WorkerSessionContext.Provider
      value={{ activeWorker, isLoggingIn, isLoggingOut, login, hasOpenPieceEvents, logout }}
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