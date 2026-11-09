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

export function resetLocalDeviceMode() {
  localStorage.removeItem(DEVICE_MODE_STORAGE_KEY);
  localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
}

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

  setLocalDeviceId(data.id);
  return data.id;
}

// ✅ دالة جديدة لجلب اسم الجهاز من قاعدة البيانات
export async function fetchDeviceById(
  deviceId: string
): Promise<{ id: string; device_name: string; device_mode: "admin" | "kiosk" } | null> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, device_name, device_mode")
    .eq("id", deviceId)
    .maybeSingle();

  if (error || !data) return null;
  return data as { id: string; device_name: string; device_mode: "admin" | "kiosk" };
}

interface RegisterDeviceResult {
  success: boolean;
  message?: string;
  errorCode?: string;
  deviceId?: string;
}

export async function registerCurrentDevice(
  deviceName: string,
  mode: LocalDeviceMode
): Promise<RegisterDeviceResult> {
  const fingerprint = getOrCreateFingerprint();

  const { data, error } = await supabase.functions.invoke("register-device", {
    body: {
      device_name: deviceName,
      device_mode: mode,
      device_fingerprint: fingerprint,
    },
  });

  if (error || !data?.success) {
    let errorCode: string | undefined = data?.error;
    let errorMessage: string | undefined = data?.message;

    if (error && typeof error === "object" && "context" in error) {
      try {
        const ctx = (error as { context: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          errorCode = body?.error ?? errorCode;
          errorMessage = body?.message ?? errorMessage;
        }
      } catch { /* ignore */ }
    }

    return {
      success: false,
      message: errorMessage ?? "تعذر تسجيل الجهاز",
      errorCode,
    };
  }

  if (data.device?.id) {
    setLocalDeviceId(data.device.id);
  }

  setLocalDeviceMode(mode);
  return { success: true, deviceId: data.device?.id };
}