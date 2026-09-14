// ============================================================================
// مزامنة كاش بيانات دخول العمال محلياً (لدعم الدخول أثناء انقطاع الإنترنت)
// تُستدعى دورياً أثناء الاتصال فقط، ومن جهاز Kiosk حصراً.
// ============================================================================

import { supabase } from "./supabaseClient";
import { localDb } from "./localDb";
import { connectivityMonitor } from "./connectivity";

interface KioskCredentialsSyncResponse {
  success: boolean;
  workers: Array<{
    id: string;
    username: string;
    password_hash: string;
    full_name: string;
    photo_url: string | null;
    is_active: boolean;
  }>;
  synced_at: string;
  error?: string;
  message?: string;
}

export async function syncWorkerCredentialsCache(): Promise<{ success: boolean; message?: string }> {
  if (!connectivityMonitor.getStatus()) {
    return { success: false, message: "لا يمكن مزامنة بيانات الدخول بدون اتصال" };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, message: "لم يتم تسجيل الدخول بعد" };
    }

    const { data, error } = await supabase.functions.invoke<KioskCredentialsSyncResponse>(
      "kiosk-credentials-sync"
    );

    // التعامل مع القيود الأمنية للـ Edge Function (عندما يكون المستدعي حساب إداري وليس Kiosk)
    if (error) {
      return { 
        success: false, 
        message: "حساب الجلسة الحالي ليس جهاز Kiosk مسجل للمزامنة" 
      };
    }

    if (!data?.success) {
      return { success: false, message: data?.message ?? "تعذر تحميل بيانات دخول العمال" };
    }

    if (data?.workers) {
      await localDb.transaction("rw", localDb.workerCredentials, async () => {
        for (const w of data.workers) {
          const existing = await localDb.workerCredentials.get(w.id);
          await localDb.workerCredentials.put({
            id: w.id,
            username: w.username,
            password_hash: w.password_hash,
            full_name: w.full_name,
            photo_url: w.photo_url,
            is_active: w.is_active,
            synced_at: data.synced_at,
            // الحفاظ على عداد القفل المحلي الحالي إن وُجد (لا نُصفِّره عند كل مزامنة)
            local_failed_attempts: existing?.local_failed_attempts ?? 0,
            local_locked_until: existing?.local_locked_until ?? null,
          });
        }
      });
    }

    return { success: true };
  } catch {
    return { success: false, message: "تعذر الاتصال بخدمة المزامنة" };
  }
}

/** تشغيل مزامنة دورية لبيانات الدخول (كل 10 دقائق أثناء الاتصال) */
export function startCredentialsSync(): () => void {
  void syncWorkerCredentialsCache();

  const unsubscribe = connectivityMonitor.subscribe((isOnline) => {
    if (isOnline) void syncWorkerCredentialsCache();
  });

  const interval = setInterval(() => {
    if (connectivityMonitor.getStatus()) void syncWorkerCredentialsCache();
  }, 10 * 60_000);

  return () => {
    unsubscribe();
    clearInterval(interval);
  };
}