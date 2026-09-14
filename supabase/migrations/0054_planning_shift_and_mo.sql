-- ============================================================================
-- 0054_planning_shift_and_mo.sql
-- إعادة تصميم قسم Planification: كل تخصيص يرتبط الآن بأمر تصنيع رسمي
-- (manufacturing_order) ويحمل رقم وردية (poste 1/2/3) بدل توقيتي بداية/نهاية
-- يدويين. shift_start/shift_end تبقيان موجودتين (للتوافق مع بيانات قديمة
-- وإمكانية استخدام مستقبلي) لكن لم تعودا إلزاميتين ولا تُعرَضان في النموذج.
-- ============================================================================

alter table planning
  add column if not exists manufacturing_order_id uuid references manufacturing_orders(id) on delete set null;

alter table planning
  add column if not exists shift_number text check (shift_number in ('poste_1', 'poste_2', 'poste_3'));

comment on column planning.shift_number is 'رقم الوردية (poste 1/2/3) — يُضبط لاحقاً بدقة في قسم العمال؛ يحل محل shift_start/shift_end في نموذج الإدخال';

alter table planning alter column shift_start drop not null;
alter table planning alter column shift_end drop not null;

create index if not exists idx_planning_mo on planning (manufacturing_order_id);

-- تحديث عرض مخطط الآلات في واجهة الكشك: إضافة اسم العامل ورقم الوردية —
-- أعمدة جديدة في نهاية القائمة فقط (CREATE OR REPLACE VIEW يمنع تغيير ترتيب
-- الأعمدة الموجودة مسبقاً، درس مستفاد من 0050)
create or replace view v_machine_planning_overview
with (security_invoker = true) as
select
  pl.id               as planning_id,
  pl.company_id,
  pl.machine_id,
  m.name              as machine_name,

  p.id                as project_id,
  p.name              as project_name,

  pt.id               as piece_task_id,
  coalesce(pt.code, pt.name) as piece_ref,
  pt.quantity,
  pt.material,

  c.name              as client_name,

  pl.planned_date,
  pl.status,

  w.id                as worker_id,
  w.full_name         as worker_name,
  pl.shift_number

from planning pl
join machines m on m.id = pl.machine_id
join workers w on w.id = pl.worker_id
left join projects p on p.id = pl.project_id
left join pieces_tasks pt on pt.id = pl.piece_task_id
left join clients c on c.id = p.client_id
where pl.status <> 'cancelled';

comment on view v_machine_planning_overview is 'المخطط الكامل لكل آلة (Projet/Réf. pièce/Quantité/Client/Matière/Ouvrier/Poste) — لواجهة الكشك، قابل للتصفية حسب التاريخ من التطبيق';
