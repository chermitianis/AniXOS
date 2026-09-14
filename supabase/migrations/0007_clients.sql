-- ============================================================================
-- 0007_clients.sql
-- عملاء الشركة (لاحقاً تُبنى عليه بوابة متابعة الطلبات الخاصة بكل عميل)
-- ============================================================================

create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,

  name            text not null,
  contact_person  text,
  phone           text,
  email           text,
  address         text,
  notes           text,

  -- إذا احتجنا لاحقاً منح العميل حساب دخول لمتابعة مشاريعه (Client Portal)
  portal_auth_user_id uuid references auth.users(id) on delete set null,

  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table clients is 'سجل عملاء الشركة؛ portal_auth_user_id يُستخدم لاحقاً لبوابة متابعة العميل (مرحلة تالية)';

create index if not exists idx_clients_company on clients (company_id);

create trigger trg_clients_updated_at
before update on clients
for each row execute function set_updated_at();
