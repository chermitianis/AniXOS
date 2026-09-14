-- ============================================================================
-- 0029_nomenclature.sql
-- Nomenclature: جدول ديناميكي بالكامل لدراسة تكلفة المشاريع — لا بنية
-- ثابتة مسبقاً، بل الشركة تُنشئ أعمدة وأسطر حسب حاجتها الفعلية (كورقة
-- Excel مبنية على قاعدة بيانات حقيقية بدل ملف منفصل).
--
-- الهيكل: nomenclatures (الدراسة نفسها) → columns + rows → cells (تقاطع
-- كل سطر مع كل عمود). القيمة نفسها نصية دائماً (value_text)؛ التفسير
-- (رقم/نص/عملة) يعتمد على column_type ويُطبَّق في الواجهة عند الحساب.
-- ============================================================================

create table if not exists nomenclatures (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  project_id            uuid references projects(id) on delete set null,  -- اختياري: دراسة مستقلة أو مرتبطة بمشروع

  name                  text not null,
  total_estimated_cost  numeric(14,2),   -- لقطة محفوظة عند آخر حفظ صريح (وليست محسوبة حية دائماً)

  created_by            uuid references staff_users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table nomenclatures is 'دراسات تكلفة المشاريع الديناميكية؛ كل دراسة قابلة للربط بمشروع أو مستقلة، وقابلة للرجوع إليها لاحقاً';

create index if not exists idx_nomenclatures_company on nomenclatures (company_id);
create index if not exists idx_nomenclatures_project on nomenclatures (project_id);

create trigger trg_nomenclatures_updated_at
before update on nomenclatures
for each row execute function set_updated_at();

-- ------------------------------------------------------------------
create table if not exists nomenclature_columns (
  id              uuid primary key default gen_random_uuid(),
  nomenclature_id uuid not null references nomenclatures(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,

  name            text not null,             -- اسم العمود كما يُدخله المستخدم بحرية كاملة
  column_type     text not null default 'text'
                  check (column_type in ('material', 'unit', 'currency', 'value', 'name', 'operation', 'text', 'number')),

  -- الأعمدة المُعلَّمة هنا تُجمَع تلقائياً لحساب total_estimated_cost
  is_total_column boolean not null default false,

  sequence_order  integer not null default 0
);

comment on table nomenclature_columns is 'أعمدة ديناميكية لكل دراسة تكلفة؛ column_type يوجّه التفسير والتنسيق في الواجهة فقط';

create index if not exists idx_nomenclature_columns_nom on nomenclature_columns (nomenclature_id, sequence_order);

-- ------------------------------------------------------------------
create table if not exists nomenclature_rows (
  id              uuid primary key default gen_random_uuid(),
  nomenclature_id uuid not null references nomenclatures(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,

  row_label       text,                       -- تسمية اختيارية للسطر (مثال: "قاعدة معدنية")
  sequence_order  integer not null default 0
);

create index if not exists idx_nomenclature_rows_nom on nomenclature_rows (nomenclature_id, sequence_order);

-- ------------------------------------------------------------------
create table if not exists nomenclature_cells (
  id              uuid primary key default gen_random_uuid(),
  nomenclature_id uuid not null references nomenclatures(id) on delete cascade,
  row_id          uuid not null references nomenclature_rows(id) on delete cascade,
  column_id       uuid not null references nomenclature_columns(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,

  value_text      text,

  unique (row_id, column_id)
);

comment on table nomenclature_cells is 'قيمة تقاطع كل سطر مع كل عمود؛ نصية دائماً، تُفسَّر حسب column_type في الواجهة';

create index if not exists idx_nomenclature_cells_nom on nomenclature_cells (nomenclature_id);
create index if not exists idx_nomenclature_cells_row on nomenclature_cells (row_id);
