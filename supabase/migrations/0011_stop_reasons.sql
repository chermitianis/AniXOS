-- ============================================================================
-- 0011_stop_reasons.sql
-- أسباب التوقف (البطاقات البرتقالية في الكشك) — قائمة قابلة للتخصيص الكامل
-- ============================================================================

create table if not exists stop_reasons (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,

  name            text not null,
  color           text not null default '#F97316',   -- لون افتراضي برتقالي
  icon            text,
  sort_order      integer not null default 0,

  -- بعض أسباب التوقف (كعطل الآلة) تتطلب من العامل كتابة ملاحظة إجبارية
  requires_note   boolean not null default false,

  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (company_id, name)
);

comment on table stop_reasons is 'أسباب التوقف القابلة للتخصيص لكل شركة؛ تغذّي العمود البرتقالي في واجهة الكشك ديناميكياً';

create index if not exists idx_stop_reasons_company on stop_reasons (company_id, sort_order);

create trigger trg_stop_reasons_updated_at
before update on stop_reasons
for each row execute function set_updated_at();
