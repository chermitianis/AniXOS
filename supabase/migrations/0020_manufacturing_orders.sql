-- ============================================================================
-- 0020_manufacturing_orders.sql
-- أمر التصنيع: الطبقة الرسمية بين "المشروع" و"التنفيذ الفعلي على الورشة".
-- مشابه لمفهوم mrp.workorder في Odoo، لكن مُبسَّط ومُصمَّم خصيصاً للربط مع
-- pieces_tasks (القطع/المراحل) التي ينفذها العامل فعلياً في الكشك.
-- ============================================================================

create table if not exists manufacturing_orders (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  project_id        uuid not null references projects(id) on delete cascade,

  order_number      text not null,
  product_name      text not null,          -- اسم المنتج/القطعة المطلوب تصنيعها
  quantity          integer not null default 1,

  status            text not null default 'draft'
                    check (status in ('draft', 'confirmed', 'in_progress', 'done', 'cancelled')),

  planned_start_date date,
  planned_end_date   date,
  notes             text,

  created_by        uuid references staff_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (company_id, order_number)
);

comment on table manufacturing_orders is 'أوامر التصنيع الرسمية؛ تُفصَّل لاحقاً إلى pieces_tasks تُنفَّذ في الكشك';

-- ربط pieces_tasks اختيارياً بأمر تصنيع رسمي (يبقى NULL إن أُنشئت القطعة مباشرة تحت المشروع فقط)
alter table pieces_tasks
  add column if not exists manufacturing_order_id uuid references manufacturing_orders(id) on delete set null;

create index if not exists idx_manufacturing_orders_company on manufacturing_orders (company_id);
create index if not exists idx_manufacturing_orders_project on manufacturing_orders (project_id);
create index if not exists idx_pieces_tasks_mo on pieces_tasks (manufacturing_order_id);

create trigger trg_manufacturing_orders_updated_at
before update on manufacturing_orders
for each row execute function set_updated_at();
