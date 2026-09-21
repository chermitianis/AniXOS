-- ============================================================================
-- 0069_accounting_module.sql
-- Module Comptabilité — Niveau A
--
-- Ajoute :
--   - Table supplier_invoices        : factures fournisseurs
--   - Table supplier_invoice_items   : lignes de facture fournisseur
--   - Vue v_accounting_summary       : KPI agrégés (CA, dépenses, bénéfice)
--   - Index + RLS + triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Table supplier_invoices
-- ----------------------------------------------------------------------------
create table if not exists supplier_invoices (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,

  invoice_number    text not null,
  supplier_name     text not null,
  supplier_email    text,
  supplier_phone    text,

  issue_date        date not null default current_date,
  due_date          date,
  payment_date      date,

  amount_ht         numeric(14, 3) not null default 0,
  vat_rate          numeric(5, 2) not null default 19,
  amount_ttc        numeric(14, 3) not null default 0,

  status            text not null default 'brouillon'
                    check (status in ('brouillon', 'recue', 'payee', 'en_retard', 'annulee')),

  category          text,                          -- ex: "Matières premières", "Services"
  reference         text,                          -- Réf. interne / bon de commande
  notes             text,

  created_by        uuid references staff_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table supplier_invoices is
  'Factures fournisseurs — module comptabilité';

create index if not exists idx_supplier_invoices_company
  on supplier_invoices (company_id, issue_date desc);

create index if not exists idx_supplier_invoices_status
  on supplier_invoices (company_id, status)
  where status in ('recue', 'en_retard');

create trigger trg_supplier_invoices_updated_at
before update on supplier_invoices
for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Table supplier_invoice_items (détail optionnel)
-- ----------------------------------------------------------------------------
create table if not exists supplier_invoice_items (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  invoice_id        uuid not null references supplier_invoices(id) on delete cascade,

  description       text not null,
  quantity          numeric(10, 3) not null default 1,
  unit_price_ht     numeric(14, 3) not null default 0,
  total_ht          numeric(14, 3) not null default 0,

  created_at        timestamptz not null default now()
);

create index if not exists idx_supplier_invoice_items_invoice
  on supplier_invoice_items (invoice_id);

-- ----------------------------------------------------------------------------
-- 3) RLS — supplier_invoices
-- ----------------------------------------------------------------------------
alter table supplier_invoices enable row level security;

drop policy if exists supplier_invoices_select on supplier_invoices;
create policy supplier_invoices_select on supplier_invoices
  for select using (company_id = get_my_company_id());

drop policy if exists supplier_invoices_insert on supplier_invoices;
create policy supplier_invoices_insert on supplier_invoices
  for insert with check (company_id = get_my_company_id());

drop policy if exists supplier_invoices_update on supplier_invoices;
create policy supplier_invoices_update on supplier_invoices
  for update using (company_id = get_my_company_id());

drop policy if exists supplier_invoices_delete on supplier_invoices;
create policy supplier_invoices_delete on supplier_invoices
  for delete using (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 4) RLS — supplier_invoice_items
-- ----------------------------------------------------------------------------
alter table supplier_invoice_items enable row level security;

drop policy if exists supplier_invoice_items_select on supplier_invoice_items;
create policy supplier_invoice_items_select on supplier_invoice_items
  for select using (company_id = get_my_company_id());

drop policy if exists supplier_invoice_items_insert on supplier_invoice_items;
create policy supplier_invoice_items_insert on supplier_invoice_items
  for insert with check (company_id = get_my_company_id());

drop policy if exists supplier_invoice_items_update on supplier_invoice_items;
create policy supplier_invoice_items_update on supplier_invoice_items
  for update using (company_id = get_my_company_id());

drop policy if exists supplier_invoice_items_delete on supplier_invoice_items;
create policy supplier_invoice_items_delete on supplier_invoice_items
  for delete using (company_id = get_my_company_id());

-- ----------------------------------------------------------------------------
-- 5) Vue v_accounting_summary (KPI agrégés)
-- ----------------------------------------------------------------------------
create or replace view v_accounting_summary
with (security_invoker = true)
as
select
  c.id as company_id,

  -- CA encaissé (factures clients payées)
  coalesce((
    select sum(i.total)
    from invoices i
    where i.company_id = c.id and i.status = 'paid'
  ), 0) as revenue_paid,

  -- CA total émis (factures clients émises + payées)
  coalesce((
    select sum(i.total)
    from invoices i
    where i.company_id = c.id and i.status in ('issued', 'paid')
  ), 0) as revenue_total,

  -- Paiements en attente (factures émises non payées)
  coalesce((
    select sum(i.total)
    from invoices i
    where i.company_id = c.id and i.status = 'issued'
  ), 0) as pending_revenue,

  -- Dépenses fournisseurs payées
  coalesce((
    select sum(si.amount_ttc)
    from supplier_invoices si
    where si.company_id = c.id and si.status = 'payee'
  ), 0) as expenses_paid,

  -- Dépenses totales engagées
  coalesce((
    select sum(si.amount_ttc)
    from supplier_invoices si
    where si.company_id = c.id and si.status in ('recue', 'payee', 'en_retard')
  ), 0) as expenses_total,

  -- Dépenses fournisseurs en attente
  coalesce((
    select sum(si.amount_ttc)
    from supplier_invoices si
    where si.company_id = c.id and si.status in ('recue', 'en_retard')
  ), 0) as pending_expenses,

  -- Nombre de factures clients en retard
  coalesce((
    select count(*)
    from invoices i
    where i.company_id = c.id and i.status = 'overdue'
  ), 0) as overdue_invoices_count,

  -- Nombre de factures fournisseurs en retard
  coalesce((
    select count(*)
    from supplier_invoices si
    where si.company_id = c.id and si.status = 'en_retard'
  ), 0) as overdue_supplier_invoices_count

from companies c;

comment on view v_accounting_summary is
  'KPI comptables agrégés par entreprise : CA, dépenses, paiements en attente, retards';