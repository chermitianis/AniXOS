# مخطط علاقات قاعدة البيانات (ERD) — ANIXOS

يعكس هذا الملف الجداول **الفعلية** المبنية في `supabase/migrations/` (22 جدولاً)، وليس تصميماً نظرياً. لأي تفصيل دقيق (أنواع الأعمدة، القيود، الفهارس) ارجع لملف الـ migration المذكور — هذا الملف للفهم السريع للعلاقات فقط.

## 1) طبقة التعدد المستأجر (Multi-Tenant) والهوية

```
companies (الشركة/المستأجر — جذر العزل الكامل)
├── roles (company_id NULL = قالب نظام | محدد = دور مخصص للشركة)
├── staff_users (id = auth.users.id) ──> roles
├── devices (auth_user_id → auth.users, اختياري لأجهزة Kiosk فقط)
└── workers (بلا Supabase Auth؛ اسم مستخدم/كلمة سر خاصة بالتطبيق)
```

كل الجداول التالية تحمل `company_id` وتخضع لسياسة RLS موحدة: `company_id = get_my_company_id()` (الدالة المركزية في `0016_rls_helpers.sql`).

## 2) الموارد التشغيلية

```
companies ─┬─> machines
           ├─> clients
           ├─> task_types      (قابلة للتخصيص الكامل لكل شركة — العمود الأزرق بالكشك)
           └─> stop_reasons    (قابلة للتخصيص الكامل لكل شركة — العمود البرتقالي بالكشك)
```

## 3) دورة العمل التجارية (Order-to-Cash)

```
clients ──> quotes ──> quote_items
              │
              │ [accept-quote Edge Function]
              ▼
           projects ──> manufacturing_orders ──> pieces_tasks
              │                                       │
              │                                       │ (تُنفَّذ في الكشك)
              ▼                                       ▼
           invoices ──> invoice_items            work_sessions
```

- `quotes.project_id` يُملأ تلقائياً عند القبول (يربط العرض بالمشروع الناتج عنه).
- `manufacturing_orders.quote_id` يحفظ الأصل التجاري لكل أمر تصنيع.
- `pieces_tasks.manufacturing_order_id` اختياري: قد تتبع قطعة مشروعاً مباشرة بلا أمر تصنيع رسمي.

## 4) الجدولة والتنفيذ الميداني (Shop Floor)

```
workers ──┬──> planning (worker + machine + project + piece + موعد)
          │
          └──> work_sessions (production | downtime)
                   │
                   ├──> task_types    (إن كانت production)
                   └──> stop_reasons  (إن كانت downtime)

work_sessions ──> activity_log (سجل خفيف للبث الحي عبر Supabase Realtime)
```

قيد جوهري: **جلسة عمل واحدة مفتوحة فقط لكل عامل** (`idx_work_sessions_one_open_per_worker`، فهرس فريد جزئي حيث `ended_at IS NULL`).

## 5) المخزون

```
inventory_items ──> inventory_transactions (in | out | adjustment)
```

`quantity_on_hand` **لا يُعدَّل مباشرة أبداً** — يُحدَّث حصرياً عبر Trigger (`apply_inventory_transaction`) عند إدراج حركة جديدة، لضمان أثر تدقيقي كامل.

## 6) محفزات الإكمال التلقائي (الحلقة الأهم في الربط)

عند تحديث `pieces_tasks.status`:
1. **إن كانت القطعة تابعة لأمر تصنيع**: يُعاد حساب حالته (`confirmed → in_progress → done`) بناءً على حالة كل قطعه.
2. **دائماً**: يُعاد حساب حالة المشروع نفسه؛ إن اكتملت كل قطعه (`status <> 'cancelled'`) يصبح `projects.status = 'completed'` تلقائياً و`completed_at = now()`.

المصدر: `0026_completion_triggers.sql` — دالة `recalc_completion_after_piece_update()`.

## 7) Views التقارير (قراءة فقط، `security_invoker = true`)

| View | الغرض |
|---|---|
| `v_project_actuals` | الوقت/التكلفة الفعليان لكل مشروع من `work_sessions` |
| `v_project_profitability` | صافي الربح + فارق الوقت + تصنيف المخاطر (`on_track/at_risk/delayed/completed`) |
| `v_piece_task_actuals` | نفس التحليل، لكن على مستوى كل قطعة (أساس التقرير الشامل) |
| `v_live_operations` | كل الجلسات المفتوحة حالياً (المشاهدة الحية للمدير) |
| `v_inventory_low_stock` | أصناف تحت حد إعادة الطلب |

## 8) الأرشفة

`projects.is_archived` (منفصل تماماً عن `status`): فعل إداري متعمَّد، لا علاقة له بمنطق الإكمال التلقائي.
