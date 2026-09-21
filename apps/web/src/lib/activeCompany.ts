// ============================================================================
// activeCompany.ts — إدارة "القاعدة النشطة" للحساب (multi-database)
//
// يوفّر:
//   - قراءة فورية من localStorage (بلا انتظار شبكة).
//   - مزامنة مع `accounts.active_company_id` في الخلفية.
//   - كتابة محلية + استدعاء RPC `set_active_company` عند التبديل.
//   - حدث مخصّص (`anixos:active-company-changed`) يُستمع له لتفعيل reload
//     عند الحاجة.
//
// ملاحظة معمارية:
//   - المفتاح في localStorage: `anixos_active_company_id`
//     (يُستخدم أيضًا في StaffAuthContext لاختيار الصف الصحيح من staff_users).
//   - `getCachedCompanyIdSync()` في `companyContext.ts` يقرأ نفس المفتاح
//     (توافق رجعي كامل مع الكود الحالي).
// ============================================================================

import { supabase } from "./supabaseClient";

export const ACTIVE_COMPANY_STORAGE_KEY = "anixos_active_company_id";
export const ACTIVE_COMPANY_CHANGED_EVENT = "anixos:active-company-changed";

/**
 * قراءة فورية من localStorage — لا تنتظر الشبكة. تُستخدم في AppRouter
 * لتفادي شاشة فارغة قبل الحصول على company_id.
 */
export function getActiveCompanyIdSync(): string | null {
  try {
    return localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * استدعاء RPC `set_active_company` على السيرفر + تحديث localStorage.
 * يتحقق السيرفر من عضوية المستخدم في الشركة قبل التحديث (راجع 0059).
 */
export async function setActiveCompany(companyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc("set_active_company", { target_company_id: companyId });
    if (error) {
      return { success: false, error: error.message };
    }
    localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, companyId);
    window.dispatchEvent(new CustomEvent(ACTIVE_COMPANY_CHANGED_EVENT, { detail: { companyId } }));
    return { success: true };
  } catch (err) {
    console.error("[setActiveCompany]", err);
    return { success: false, error: "network" };
  }
}

/**
 * مسح القاعدة النشطة (يُستخدم عند signOut).
 */
export function clearActiveCompany(): void {
  try {
    localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
  } catch {
    // متصفح في وضع التصفح الخاص: لا شيء نفعله
  }
}

/**
 * مزامنة `active_company_id` من السيرفر إلى localStorage.
 * تُستدعى في الخلفية بعد Login (best-effort).
 *
 * المنطق:
 *   - إن كان المستخدم مالكًا وله قاعدة محفوظة في accounts.active_company_id:
 *     حدّث localStorage.
 *   - إن كان موظفًا: اكتب company_id الخاصة به.
 *   - إن لم يُحفظ شيء بعد: اترك localStorage فارغًا ليعرض AppRouter
 *     صفحة الاختيار.
 */
export async function syncActiveCompanyFromServer(userId: string): Promise<string | null> {
  try {
    // 1) هل المستخدم مالك؟ (accounts.id = userId)
    const { data: accountRow } = await supabase
      .from("accounts")
      .select("active_company_id")
      .eq("id", userId)
      .maybeSingle();

    if (accountRow && accountRow.active_company_id) {
      localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, accountRow.active_company_id);
      return accountRow.active_company_id;
    }

    // 2) المستخدم موظف → نأخذ company_id من أول صف staff_users
    const { data: staffRow } = await supabase
      .from("staff_users")
      .select("company_id")
      .eq("auth_user_id", userId)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (staffRow?.company_id) {
      localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, staffRow.company_id);
      return staffRow.company_id;
    }

    return null;
  } catch (err) {
    console.warn("[syncActiveCompanyFromServer] échec best-effort :", err);
    return null;
  }
}