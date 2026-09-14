// ============================================================================
// إدارة "دور الجهاز" محلياً: يُقرأ مرة واحدة عند أول تشغيل، ثم يُحفظ بشكل
// دائم في localStorage (وليس sessionStorage) لأن هذا القرار يجب أن يبقى
// ثابتاً عبر عمليات إعادة التشغيل، بخلاف جلسة العامل التي تنتهي كل مناوبة.
// ============================================================================

import { supabase } from "./supabaseClient";

export type LocalDeviceMode = "admin" | "kiosk";

const DEVICE_MODE_STORAGE_KEY = "anixos_device_mode";

export function getLocalDeviceMode(): LocalDeviceMode | null {
  const stored = localStorage.getItem(DEVICE_MODE_STORAGE_KEY);
  return stored === "admin" || stored === "kiosk" ? stored : null;
}

function setLocalDeviceMode(mode: LocalDeviceMode) {
  localStorage.setItem(DEVICE_MODE_STORAGE_KEY, mode);
}

/** يُستخدم فقط لأغراض الاختبار/إعادة الضبط اليدوي من شاشة إعدادات متقدمة لاحقاً */
export function resetLocalDeviceMode() {
  localStorage.removeItem(DEVICE_MODE_STORAGE_KEY);
}

interface RegisterDeviceResult {
  success: boolean;
  message?: string;
}

/**
 * يُسجِّل الجهاز الحالي بدوره المختار. يجب أن يُستدعى بينما المستخدم لا يزال
 * مسجَّل دخوله كموظف (StaffAuth)، لأن الدالة تحتاج تلك الجلسة للتحقق من
 * الصلاحية. بعد النجاح في حالة Kiosk، تُستبدَل جلسة المتصفح بجلسة الجهاز
 * الدائمة فوراً (ويخرج الموظف تلقائياً من جلسته الشخصية على هذا الجهاز).
 */
export async function registerCurrentDevice(
  deviceName: string,
  mode: LocalDeviceMode
): Promise<RegisterDeviceResult> {
  const { data, error } = await supabase.functions.invoke("register-device", {
    body: { device_name: deviceName, device_mode: mode },
  });

  if (error || !data?.success) {
    return { success: false, message: data?.message ?? "تعذر تسجيل الجهاز" };
  }

  if (mode === "kiosk" && data.device_credentials) {
    // استبدال الجلسة: خروج الموظف من جلسته الشخصية، ودخول بحساب الجهاز
    // الدائم الذي أُنشئ للتو. هذا التبديل يحدث مرة واحدة فقط في حياة الجهاز.
    await supabase.auth.signOut();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.device_credentials.email,
      password: data.device_credentials.password,
    });

    if (signInError) {
      return { success: false, message: "تم تسجيل الجهاز لكن تعذر تفعيل جلسته الدائمة" };
    }
  }

  setLocalDeviceMode(mode);
  return { success: true };
}
