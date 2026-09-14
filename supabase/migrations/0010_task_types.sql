-- ============================================================================
-- 0010_task_types.sql
-- أنواع المهام الإنتاجية (البطاقات الزرقاء في الكشك) — قائمة مُعرَّفة بالكامل
-- من قبل كل شركة عبر معالج الإعداد، وليست ثابتة داخل الكود المصدري إطلاقاً.
-- الأمثلة الواردة في وثيقة التكليف (Passation, Mise en place...) هي توضيح
-- شكلي فقط لكيفية ظهور الواجهة، لا قائمة مُلزمة.
-- ============================================================================

create table if not exists task_types (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,

  name          text not null,             -- اسم البطاقة كما يُدخله مسؤول الشركة
  color         text not null default '#2563EB',   -- لون البطاقة (افتراضي أزرق)
  icon          text,                       -- معرف أيقونة اختياري
  sort_order    integer not null default 0, -- ترتيب الظهور في الشبكة (2×6)

  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (company_id, name)
);

comment on table task_types is 'أنواع المهام الإنتاجية القابلة للتخصيص لكل شركة؛ تغذّي العمود الأزرق في واجهة الكشك ديناميكياً';

create index if not exists idx_task_types_company on task_types (company_id, sort_order);

create trigger trg_task_types_updated_at
before update on task_types
for each row execute function set_updated_at();
