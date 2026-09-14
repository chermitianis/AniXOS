# مصفوفة الأدوار والصلاحيات (RBAC) — ANIXOS

الأدوار مخزَّنة في جدول `roles`، وقوالب النظام الخمسة أدناه تُزرع تلقائياً لكل قاعدة بيانات جديدة عبر `0002_roles_permissions.sql` (حيث `company_id IS NULL`). يمكن لأي شركة إضافة أدوار مخصصة إضافية فوق هذه القوالب.

**آلية الصلاحيات**: عمود `permissions` (JSONB) بالشكل:
```json
{ "module_name": ["view", "create", "edit", "delete", "approve"] }
```
مفتاح `"all"` يمنح صلاحية كاملة على كل الوحدات (دور Owner تحديداً). يُتحقَّق من الصلاحية في الواجهة عبر `hasPermission()` في `apps/web/src/auth/permissions.ts`.

## القوالب الخمسة الفعلية

| الكود | الاسم | الصلاحيات المزروعة افتراضياً |
|---|---|---|
| `owner` | المدير العام / المالك | `all: [view, create, edit, delete, approve]` — كل شيء بلا استثناء |
| `supervisor` | رئيس الورشة | `planning: [view,create,edit]`, `shop_floor: [view,edit]`, `workers: [view]`, `machines: [view,edit]` |
| `engineering` | الهندسة والمشاريع | `projects: [view,create,edit]`, `pieces_tasks: [view,create,edit]`, `task_types: [view,create,edit]` |
| `accounting` | المحاسبة والمالية | `accounting: [view,create,edit]`, `sales: [view,create,edit]`, `reports: [view]` |
| `hr` | الموارد البشرية | `workers: [view,create,edit,delete]`, `staff_users: [view,create,edit]` |

## حالتان خاصتان خارج نظام `roles` تماماً

### 1) العامل (Worker)
**ليس له دور RBAC ولا حساب Supabase Auth إطلاقاً.** وصوله مقصور بنيوياً (وليس فقط بالصلاحيات) على واجهة الكشك فقط، عبر جلسة منطقية (`WorkerSessionContext`) لا علاقة لها بنظام الأدوار. راجع `worker-login` Edge Function.

### 2) جهاز Kiosk
له حساب Auth **تقني بحت** (`devices.auth_user_id`) لا يُمثِّل موظفاً ولا يحمل أي دور — وظيفته الوحيدة تمرير فحص RLS (`get_my_company_id()`) لتمكين الكشك من القراءة/الكتابة ضمن نطاق شركته فقط.

## قيود أمنية إضافية تتجاوز RBAC العادي (مقصودة وصارمة)

هذه القيود مطبَّقة على مستوى قاعدة البيانات نفسها (RLS + صلاحيات الأعمدة)، **وليست** قابلة للتجاوز بتعديل `permissions` من الواجهة:

| القيد | أين | لماذا |
|---|---|---|
| `password_hash` غير قابل للقراءة إطلاقاً عبر `authenticated` | `0019_workers_column_security.sql` | حتى لو امتلك موظف صلاحية `workers:view` كاملة، لا يمكنه أبداً سحب كلمات سر العمال المشفَّرة |
| `odoo_config` مقصور على `is_owner = true` حصرياً | `0017_rls_policies.sql` | إعدادات الاتصال بـ Odoo حساسة؛ لا دور آخر (حتى accounting) يراها |
| تسجيل جهاز Kiosk جديد مقصور على `is_owner = true` | `register-device` Edge Function | جهاز Kiosk يحصل لاحقاً على صلاحية قراءة كل كلمات سر العمال المشفَّرة محلياً (`kiosk-credentials-sync`)، فهذا قرار حساس يستحق أعلى تفويض |
| `inventory_transactions`: لا `UPDATE` ولا `DELETE` إطلاقاً لأي دور | `0023_new_tables_rls.sql` | أثر تدقيقي دائم؛ أي تصحيح يجب أن يكون حركة `adjustment` جديدة |
| `activity_log`: لا `UPDATE` ولا `DELETE` إطلاقاً | `0017_rls_policies.sql` | سجل تاريخي، ليس قابلاً للتعديل بطبيعته |

## ملاحظة مهمة حول الحالة الحالية للتطبيق

واجهات الإدارة المبنية حتى الآن (`apps/web/src/modules/setup/pages/*AdminPage.tsx`) **لا تُطبِّق فحص `hasPermission()` بعد على مستوى الواجهة** — أي موظف مسجَّل دخوله (بغض النظر عن دوره) يرى كل عناصر القائمة الجانبية حالياً. الحماية الفعلية الوحيدة العاملة الآن هي RLS على مستوى قاعدة البيانات (لا يمكنه فعلياً الكتابة/القراءة خارج نطاق شركته). **ربط `hasPermission()` بإخفاء/تعطيل عناصر الواجهة حسب الدور مهمة متبقية** يجب إنجازها قبل الاعتماد الإنتاجي الكامل لأدوار غير Owner.
