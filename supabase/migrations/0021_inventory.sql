-- ============================================================================
-- 0021_inventory.sql
-- المخزون: الخامات المعدنية، قطع الغيار، وأدوات القطع/التصنيع.
-- quantity_on_hand يُحدَّث فقط عبر inventory_transactions (لا تعديل مباشر
-- عليه)، لضمان وجود أثر تدقيقي (Audit Trail) كامل لكل حركة مخزون.
-- ============================================================================

create table if not exists inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,

  name                text not null,
  code                text not null,
  category            text,                      -- خامات معدنية / قطع غيار / أدوات قطع...
  unit                text not null default 'قطعة', -- وحدة القياس (كجم، متر، قطعة...)

  quantity_on_hand    numeric(14,3) not null default 0,
  reorder_threshold   numeric(14,3) not null default 0,  -- حد التنبيه للنقص
  unit_cost           numeric(14,2) not null default 0,
  location            text,

  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (company_id, code)
);

comment on table inventory_items is 'أصناف المخزون: خامات، قطع غيار، أدوات؛ الكمية تُحدَّث حصراً عبر inventory_transactions';

create index if not exists idx_inventory_items_company on inventory_items (company_id);

create trigger trg_inventory_items_updated_at
before update on inventory_items
for each row execute function set_updated_at();

-- ------------------------------------------------------------------
create table if not exists inventory_transactions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  item_id         uuid not null references inventory_items(id) on delete cascade,

  transaction_type text not null check (transaction_type in ('in', 'out', 'adjustment')),
  quantity        numeric(14,3) not null,     -- دائماً موجبة؛ الاتجاه يُحدَّده transaction_type
  reference       text,                        -- مرجع حر: رقم فاتورة شراء، أمر تصنيع...
  manufacturing_order_id uuid references manufacturing_orders(id) on delete set null,

  created_by      uuid references staff_users(id) on delete set null,
  created_at      timestamptz not null default now(),

  -- in/out يجب أن تكون الكمية موجبة دائماً (الاتجاه يُحدِّده transaction_type
  -- نفسه)؛ adjustment وحدها تقبل قيمة موقَّعة (موجبة أو سالبة) لكن غير صفرية
  constraint chk_inventory_tx_quantity check (
    (transaction_type in ('in', 'out') and quantity > 0)
    or
    (transaction_type = 'adjustment' and quantity <> 0)
  )
);

comment on table inventory_transactions is 'سجل حركات المخزون (دخول/خروج/تسوية)؛ مصدر الحقيقة لحساب الكمية الحالية';

create index if not exists idx_inventory_tx_company on inventory_transactions (company_id);
create index if not exists idx_inventory_tx_item on inventory_transactions (item_id, created_at);

-- تحديث الكمية الحالية تلقائياً عند إدراج حركة جديدة
create or replace function apply_inventory_transaction()
returns trigger as $$
begin
  update inventory_items
  set quantity_on_hand = quantity_on_hand +
    case new.transaction_type
      when 'in' then new.quantity
      when 'out' then -new.quantity
      when 'adjustment' then new.quantity  -- التسوية تحمل القيمة الموقَّعة مباشرة (قد تكون سالبة)
    end
  where id = new.item_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_apply_inventory_transaction
after insert on inventory_transactions
for each row execute function apply_inventory_transaction();
