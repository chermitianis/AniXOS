// ============================================================================
// تحديد company_id لجلسة الجهاز الحالية (device أو staff)، مع كاش محلي
// يسمح باستمرار عمل التطبيق حتى لو انقطع الاتصال قبل أول استدعاء ناجح.
// ============================================================================

import { supabase } from "./supabaseClient";

const COMPANY_ID_STORAGE_KEY = "anixos_company_id";
let cachedCompanyId: string | null = null;

export async function resolveCompanyId(): Promise<string | null> {
  if (cachedCompanyId) return cachedCompanyId;

  const stored = localStorage.getItem(COMPANY_ID_STORAGE_KEY);
  if (stored) cachedCompanyId = stored;

  try {
    const { data, error } = await supabase.rpc("get_my_company_id");
    if (!error && data) {
      cachedCompanyId = data as string;
      localStorage.setItem(COMPANY_ID_STORAGE_KEY, cachedCompanyId);
    }
  } catch {
    // فشل الاتصال: نكتفي بالقيمة المخزَّنة محلياً (إن وُجدت) دون رمي خطأ
  }

  return cachedCompanyId;
}

/** نسخة متزامنة (Sync) تُستخدم في السياقات التي لا تحتمل انتظار Promise */
export function getCachedCompanyIdSync(): string | null {
  if (cachedCompanyId) return cachedCompanyId;
  return localStorage.getItem(COMPANY_ID_STORAGE_KEY);
}
