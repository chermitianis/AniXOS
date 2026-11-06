// ============================================================================
// deviceFingerprint: حساب بصمة فريدة للمتصفح
// تُستخدم للتعرف على الجهاز حتى بعد مسح localStorage
// ============================================================================

/**
 * حساب بصمة بسيطة وفريدة للمتصفح بناءً على خصائص ثابتة.
 * لا تعتمد على أي مكتبات خارجية.
 */
export function computeDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency ?? "",
    // @ts-ignore - deviceMemory غير مدعوم في كل المتصفحات
    navigator.deviceMemory ?? "",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];

  const raw = components.join("|");
  
  // إنشاء hash بسيط (djb2)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 33) ^ raw.charCodeAt(i);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
}

const FINGERPRINT_STORAGE_KEY = "anixos_device_fingerprint";

/**
 * جلب البصمة من localStorage أو حسابها وحفظها.
 */
export function getOrCreateFingerprint(): string {
  try {
    const stored = localStorage.getItem(FINGERPRINT_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage غير متاح
  }

  const fingerprint = computeDeviceFingerprint();
  try {
    localStorage.setItem(FINGERPRINT_STORAGE_KEY, fingerprint);
  } catch {
    // فشل الحفظ، لكن نعيد البصمة على الأقل
  }
  return fingerprint;
}
