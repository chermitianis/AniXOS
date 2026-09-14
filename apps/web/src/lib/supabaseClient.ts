import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // فشل مبكر وواضح أفضل من تعطل صامت لاحقاً في مكان غير متوقع
  throw new Error(
    "متغيرات البيئة VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY مطلوبة. راجع ملف .env"
  );
}

// ملاحظة تصميمية: لا نُمرِّر Database generic هنا عمداً. الأنواع في
// shared/types/database.ts مكتوبة يدوياً (وليست مولَّدة عبر
// `supabase gen types typescript`)، وتمريرها كـ generic لعميل Supabase
// يُربك أحياناً محرك استنتاج الأنواع الداخلي في postgrest-js (خصوصاً مع
// narrowing بعد فحوصات null). لذلك: العميل هنا عام (untyped)، وكل استعلام
// يُحدِّد نوعه صراحة عبر "as StaffUser" ونحوها عند الحاجة — أكثر صراحة
// وأكثر استقراراً من الاعتماد على استنتاج تلقائي غير موثوق.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // الجلسة (سواء لموظف إداري أو لجهاز Kiosk) يجب أن تبقى محفوظة محلياً
    // وتتجدد تلقائياً، لأن جهاز الكشك قد يبقى مفتوحاً لأيام دون إعادة تشغيل
    persistSession: true,
    autoRefreshToken: true,
  },
});
