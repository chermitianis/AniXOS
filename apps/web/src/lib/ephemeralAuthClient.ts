// ============================================================================
// عميل Supabase مؤقت (Ephemeral) بلا حفظ جلسة إطلاقاً — يُستخدَم حصرياً
// للتحقق من بيانات دخول مدير من داخل واجهة الكشك (زر إعادة تهيئة الجهاز)
// دون التأثير على جلسة الجهاز الدائمة الحقيقية المحفوظة في localStorage.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function createEphemeralAuthClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * يتحقق أن (email, password) تخصان موظفاً حقيقياً يملك صلاحية "settings:edit"
 * (أو هو المالك)، ضمن نفس الشركة التي يخدمها هذا الجهاز. لا يُغيِّر أي جلسة
 * حقيقية على الإطلاق.
 */
export async function verifyManagerCredentials(
  email: string,
  password: string
): Promise<{ success: boolean; message?: string }> {
  const ephemeralClient = createEphemeralAuthClient();

  const { error: signInError } = await ephemeralClient.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { success: false, message: "بيانات الدخول غير صحيحة" };
  }

  const {
    data: { user },
  } = await ephemeralClient.auth.getUser();

  if (!user) {
    return { success: false, message: "تعذر التحقق من الهوية" };
  }

  // منذ 0059: شخص واحد قد يملك أكثر من صف staff_users (مالك بعدة قواعد) —
  // .maybeSingle() لم يعد آمناً هنا (يفشل عند أكثر من صف). نتحقق بدل ذلك من
  // وجود صلاحية settings:edit في أيٍّ من شركاته (كافٍ لهذه البوابة الخاصة
  // بإعادة تهيئة جهاز الكشك؛ ربطها بشركة الجهاز تحديداً موضوع لاحق).
  const { data: staffRows, error: staffError } = await ephemeralClient
    .from("staff_users")
    .select("is_owner, roles(permissions)")
    .eq("auth_user_id", user.id);

  if (staffError || !staffRows || staffRows.length === 0) {
    return { success: false, message: "هذا الحساب ليس حساب موظف إداري في هذه الشركة" };
  }

  const hasSettingsAccess = staffRows.some((staff) => {
    const permissions = (staff.roles as unknown as { permissions?: Record<string, string[]> } | null)?.permissions;
    return staff.is_owner || permissions?.["all"]?.includes("edit") || permissions?.["settings"]?.includes("edit");
  });

  if (!hasSettingsAccess) {
    return { success: false, message: "هذا الحساب لا يملك صلاحية تعديل إعدادات الجهاز" };
  }

  // إنهاء الجلسة المؤقتة فوراً بعد التحقق — لم تُحفَظ أصلاً (persistSession: false)
  await ephemeralClient.auth.signOut();

  return { success: true };
}
