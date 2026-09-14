-- ============================================================================
-- 0019_workers_column_security.sql
-- RLS يحمي على مستوى "الصفوف" (أي شركة يمكنها رؤية أي صفوف)، لكنه لا يمنع
-- قراءة عمود معين ضمن صف مسموح به. password_hash حساس جداً بحيث لا يجوز أن
-- يصل لأي طلب SELECT عادي من الواجهة الأمامية (authenticated role)، حتى لو
-- كان ضمن نفس الشركة. الوصول إليه يجب أن يمر حصراً عبر Edge Functions
-- بصلاحية service_role (والتي تتجاوز صلاحيات الأعمدة أصلاً).
--
-- بعد هذا الملف: أي استعلام من الواجهة الأمامية يستخدم select('*') على
-- workers سيفشل بخطأ "permission denied for column password_hash" — وهذا
-- إجباري ومقصود؛ يجب أن تُحدَّد الأعمدة صراحة دائماً عند الاستعلام عن العمال.
-- ============================================================================

-- أولاً: سحب كل الصلاحيات الافتراضية على الجدول من authenticated، ثم منح
-- الأعمدة الآمنة فقط صراحة (نهج "القائمة البيضاء" الأكثر أماناً)
revoke select on workers from authenticated;

grant select (
  id, company_id, full_name, username, rfid_code, photo_url,
  hourly_cost, skill_level, is_active, created_at, updated_at
) on workers to authenticated;

-- الكتابة (إضافة/تعديل عامل جديد من شاشة الإعداد) تبقى مسموحة كما هي عبر
-- RLS العادي، لأن إنشاء كلمة السر (تشفيرها) يحدث في الواجهة قبل الإرسال
-- عبر bcryptjs من جانب العميل، وهذا مقبول لأنه "كتابة" وليس "قراءة" لاحقة.
-- (ملاحظة: لا نقيّد insert/update على مستوى الأعمدة هنا، فقط SELECT)

comment on column workers.password_hash is
  'محمي بمنع قراءة على مستوى العمود لدور authenticated؛ لا يُقرأ إلا عبر service_role داخل Edge Functions';
