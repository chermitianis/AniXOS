-- ============================================================================
-- 0022_sales.sql
-- المبيعات: عروض الأسعار (Quotes) والفواتير (Invoices)، كلاهما مرتبط
-- بالعميل، وقد يرتبط بمشروع محدد. المجموع الكلي يُحسب من بنود كل مستند.
-- ============================================================================

create table if not exists quotes (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  project_id        uuid references projects(id) on delete set null,

  quote_number      text not null,
  status            text not null default 'draft'
                    check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),

  valid_until       date,
  notes             text,

  created_by        uuid references staff_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (company_id, quote_number)
);

comment on table quotes is 'عروض الأسعار الفنية والمالية المرسَلة للعملاء';

create trigger trg_quotes_updated_at
before update on quotes
for each row execute function set_updated_at();

create table if not exists quote_items (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references quotes(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,

  description   text not null,
  quantity      numeric(12,2) not null default 1,
  unit_price    numeric(14,2) not null default 0,
  sequence_order integer not null default 0
);

comment on table quote_items is 'بنود عرض السعر؛ المجموع الكلي = مجموع (quantity × unit_price)';

create index if not exists idx_quotes_company on quotes (company_id);
create index if not exists idx_quote_items_quote on quote_items (quote_id);

-- ------------------------------------------------------------------
create table if not exists invoices (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  project_id        uuid references projects(id) on delete set null,
  quote_id          uuid references quotes(id) on delete set null,

  invoice_number    text not null,
  status            text not null default 'draft'
                    check (status in ('draft', 'issued', 'paid', 'overdue', 'cancelled')),

  issued_date       date,
  due_date          date,
  notes             text,

  created_by        uuid references staff_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (company_id, invoice_number)
);

comment on table invoices is 'الفواتير الصادرة للعملاء، قد تنشأ من عرض سعر مقبول أو مباشرة';

create trigger trg_invoices_updated_at
before update on invoices
for each row execute function set_updated_at();

create table if not exists invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,

  description   text not null,
  quantity      numeric(12,2) not null default 1,
  unit_price    numeric(14,2) not null default 0,
  sequence_order integer not null default 0
);

create index if not exists idx_invoices_company on invoices (company_id);
create index if not exists idx_invoice_items_invoice on invoice_items (invoice_id);
