// ============================================================================
// إدارة "دور الجهاز" محلياً + استرداد تلقائي من قاعدة البيانات
// ============================================================================

import { supabase } from "./supabaseClient";
import { getOrCreateFingerprint } from "./deviceFingerprint";

export type LocalDeviceMode = "admin" | "kiosk";

const DEVICE_MODE_STORAGE_KEY = "anixos_device_mode";
const DEVICE_ID_STORAGE_KEY = "anixos_device_id";

export function getLocalDeviceMode(): LocalDeviceMode | null {
  const stored = localStorage.getItem(DEVICE_MODE_STORAGE_KEY);
  return stored === "admin" || stored === "kiosk" ? stored : null;
}

function setLocalDeviceMode(mode: LocalDeviceMode) {
  localStorage.setItem(DEVICE_MODE_STORAGE_KEY, mode);
}

/** يُستخدم فقط لأغراض الاختبار/إعادة الضبط اليدوي */
export function resetLocalDeviceMode() {
  localStorage.removeItem(DEVICE_MODE_STORAGE_KEY);
  localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
}

// ✅ تخزين device_id محلياً
export function setLocalDeviceId(deviceId: string) {
  try {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  } catch { /* ignore */ }
}

export function getLocalDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * ✅ استرداد device_id تلقائياً من قاعدة البيانات باستخدام البصمة
 * يُستخدم عندما يكون localStorage فارغاً (تم مسح الكاش).
 */
export async function recoverDeviceIdFromFingerprint(
  companyId: string
): Promise<string | null> {
  const fingerprint = getOrCreateFingerprint();
  if (!fingerprint) return null;

  const { data, error } = await supabase
    .from("devices")
    .select("id")
    .eq("company_id", companyId)
    .eq("device_fingerprint", fingerprint)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  // إعادة حفظها محلياً للاستخدام المستقبلي
  setLocalDeviceId(data.id);
  return data.id;
}

interface RegisterDeviceResult {
  success: boolean;
  message?: string;
  deviceId?: string;
}

/**
 * يُسجِّل الجهاز الحالي بدوره المختار.
 */
export async function registerCurrentDevice(
  deviceName: string,
  mode: LocalDeviceMode
): Promise<RegisterDeviceResult> {
  // ✅ حساب البصمة وإرسالها
  const fingerprint = getOrCreateFingerprint();

  const { data, error } = await supabase.functions.invoke("register-device", {
    body: {
      device_name: deviceName,
      device_mode: mode,
      device_fingerprint: fingerprint,
    },
  });

  if (error || !data?.success) {
    return { success: false, message: data?.message ?? "تعذر تسجيل الجهاز" };
  }

  // ✅ حفظ device_id محلياً
  if (data.device?.id) {
    setLocalDeviceId(data.device.id);
  }

  if (mode === "kiosk" && data.device_credentials) {
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
  return { success: true, deviceId: data.device?.id };
}
