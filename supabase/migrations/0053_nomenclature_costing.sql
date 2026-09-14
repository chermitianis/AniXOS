-- ============================================================================
-- 0053_nomenclature_costing.sql
-- توسيع النظام الديناميكي الموجود لـ Nomenclature (0029) ليدعم:
--   1) سعر الساعة لكل عمود من نوع "operation" → حساب التكلفة = ساعات × سعر
--   2) ربط كل سطر بالقطعة الحقيقية (pieces_tasks) التي يستورد منها المشروع
--   3) حالة موافقة الدراسة نفسها: en_attente (بانتظار المدير) / valide
-- لا حاجة لسياسات RLS جديدة — الحماية على مستوى الصف (row) وليس العمود،
-- والجداول الأربعة محمية بالفعل منذ 0030.
-- ============================================================================

alter table nomenclature_columns
  add column if not exists hourly_rate numeric(10,2);

comment on column nomenclature_columns.hourly_rate is 'سعر ساعة العملية (دج/ساعة مثلاً) — يُستخدم فقط عندما column_type = ''operation''؛ القيمة المُدخلة في الخلية تُعتبر عدد ساعات وتُضرب بهذا السعر لحساب التكلفة';

alter table nomenclature_rows
  add column if not exists piece_task_id uuid references pieces_tasks(id) on delete set null;

comment on column nomenclature_rows.piece_task_id is 'القطعة الأصلية (من قسم Projets) التي استُورد منها هذا السطر تلقائياً — يمنع استيراد نفس القطعة مرتين ويتيح لاحقاً الربط مع Ordre de fabrication';

create unique index if not exists idx_nomenclature_rows_unique_piece
  on nomenclature_rows (nomenclature_id, piece_task_id)
  where piece_task_id is not null;

alter table nomenclatures
  add column if not exists status text not null default 'en_attente'
    check (status in ('en_attente', 'valide')),
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references staff_users(id) on delete set null;

comment on column nomenclatures.status is 'en_attente = بانتظار موافقة المدير، valide = معتمدة ومتاحة لقسم Ordre de fabrication';

create index if not exists idx_nomenclatures_status on nomenclatures (company_id, status);
