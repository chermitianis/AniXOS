// ============================================================================
// تحديد company_id لجلسة الجهاز الحالية (device أو staff)، مع كاش محلي
// يسمح باستمرار عمل التطبيق حتى لو انقطع الاتصال قبل أول استدعاء ناجح.
//
// ملاحظة (منذ المرحلة 3): المفتاح الموحّد هو `anixos_active_company_id`
// (تشاركه معه `lib/activeCompany.ts` + `StaffAuthContext`). الحفاظ على
// قراءة المفتاح القديم `anixos_company_id` يضمن توافقًا رجعيًا كاملًا
// للجلسات القائمة قبل الترقية.
// ============================================================================

import { supabase } from "./supabaseClient";

const PRIMARY_KEY = "anixos_active_company_id";
const LEGACY_KEY = "anixos_company_id";
let cachedCompanyId: string | null = null;

function readStorage(): string | null {
  try {
    return localStorage.getItem(PRIMARY_KEY) ?? localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

function writeStorage(id: string) {
  try {
    localStorage.setItem(PRIMARY_KEY, id);
    // تنظيف المفتاح القديم عند الترقية
    if (localStorage.getItem(LEGACY_KEY)) localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export async function resolveCompanyId(): Promise<string | null> {
  if (cachedCompanyId) return cachedCompanyId;

  const stored = readStorage();
  if (stored) cachedCompanyId = stored;

  try {
    const { data, error } = await supabase.rpc("get_my_company_id");
    if (!error && data) {
      cachedCompanyId = data as string;
      writeStorage(cachedCompanyId);
    }
  } catch {
    // فشل الاتصال: نكتفي بالقيمة المخزَّنة محلياً (إن وُجدت) دون رمي خطأ
  }

  return cachedCompanyId;
}

/** نسخة متزامنة (Sync) تُستخدم في السياقات التي لا تحتمل انتظار Promise */
export function getCachedCompanyIdSync(): string | null {
  if (cachedCompanyId) return cachedCompanyId;
  return readStorage();
}

/** مسح الكاش (يُستخدم عند signOut) */
export function clearCompanyIdCache() {
  cachedCompanyId = null;
}