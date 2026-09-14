-- ============================================================================
-- 0025_workflow_linkage_columns.sql
-- أعمدة الربط الناقصة لإكمال دورة العمل: قبول عرض سعر → مشروع + أمر تصنيع
-- → تنفيذ → إكمال → أرشفة. كل عمود هنا يخدم حلقة واحدة من هذه السلسلة.
-- ============================================================================

-- ربط أمر التصنيع بعرض السعر الذي نشأ عنه (إن وُجد) — يتيح تتبع الأصل
-- التجاري الكامل لكل أمر تصنيع
alter table manufacturing_orders
  add column if not exists quote_id uuid references quotes(id) on delete set null;

-- الأرشفة فعل إداري متعمَّد ومنفصل عن "اكتمال" المشروع (مشروع قد يكتمل
-- تنفيذياً لكن يبقى مرئياً في القوائم النشطة إلى أن يُقرِّر المدير أرشفته)
alter table projects
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists idx_projects_archived on projects (company_id, is_archived);
